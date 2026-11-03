import "server-only";

import { randomUUID } from "node:crypto";

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { logOrderEvent, type AuditActor } from "@repo/lib/audit/log";
import { openClientOrderThread } from "@repo/lib/chat/assistant";
import { chatHref } from "@repo/lib/chat/routes";
import { clientPath, clientUrl } from "@repo/lib/client-portal/paths";
import { formatMoney } from "@repo/lib/currency/format";
import { InvoiceError } from "@repo/lib/invoices/server/errors";
import * as invoices from "@repo/lib/invoices/server/service";
import { buildAndInsertOrder } from "@repo/lib/orders/create";
import { receiveOrder } from "@repo/lib/orders/receive";
import { bookListPrice } from "@repo/lib/production/sheets/server";
import { notifyActor } from "@repo/lib/push/send";
import { MEDIA_BUCKET } from "@repo/lib/storage/client";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { paidByOrders } from "@repo/lib/wallet/orders";
import { WalletError } from "@repo/lib/wallet/server/errors";
import { startOrderPayment } from "@repo/lib/wallet/server/mobile-money";

import { ASSISTANT_NAME, MAX_PROMPTS_PER_DAY, canAutoApprove, clientConfirmedAfter, everyItemHasPhotos } from "../core/rules";
import * as store from "./store";
import type { PendingItem } from "./store";

export const ASSISTANT_ACTOR: AuditActor = { type: "system", id: "assistant", name: ASSISTANT_NAME };

export interface ToolContext {
  conversationId: string;
  client: { id: string; name: string; email: string | null; phone: string | null };
  /** What it did, for the boss's list. */
  actions: string[];
}

export async function tellManagers(title: string, body: string, url: string): Promise<void> {
  const { data } = await createAdminClient().from("profiles").select("id").in("role", ["receptionist", "supervisor", "boss"]);
  await Promise.all((data ?? []).map((m) => notifyActor({ type: "dashboard_user", id: m.id }, { title, body, url })));
}

/** Refusals are sentences for the model to act on, not failures of the chat. */
async function guarded(work: () => Promise<string>): Promise<string> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof WalletError || err instanceof InvoiceError) return `Refused: ${err.message}`;
    throw err;
  }
}

async function ownOrder(ctx: ToolContext, orderId: string): Promise<{ id: string; order_no: string } | null> {
  const { data } = await createAdminClient().from("orders").select("id, order_no").eq("id", orderId).eq("client_id", ctx.client.id).maybeSingle();
  return data;
}

function invoiceLink(token: string): string {
  return clientUrl(clientPath(`/invoice/${token}`));
}

/** Copies the photos a client sent in chat onto the order's item, unchanged: they get printed. */
async function photosToItem(ctx: ToolContext, itemId: string, orderNo: string, orderId: string, item: PendingItem): Promise<void> {
  const db = createAdminClient();
  const by = { uploaded_by_type: null, uploaded_by_id: null, uploaded_by_name: ASSISTANT_NAME, uploaded_by_role: null };
  if (item.photo_link) {
    const { error } = await db.from("order_item_media").insert({ order_item_id: itemId, file_name: item.photo_link, secure_url: item.photo_link, ...by });
    if (error) throw new Error(error.message);
    await logOrderEvent({ orderId, orderItemId: itemId, actor: ASSISTANT_ACTOR, action: "link_added", detail: { itemLabel: orderNo } });
  }
  if (!item.attachment_ids.length) return;
  const { data: files, error } = await db
    .from("chat_attachments")
    .select("storage_path, file_name, mime_type")
    .eq("conversation_id", ctx.conversationId)
    .in("id", item.attachment_ids);
  if (error) throw new Error(error.message);
  for (const file of files ?? []) {
    const download = await db.storage.from("chat-attachments").download(file.storage_path);
    if (download.error) throw new Error(download.error.message);
    const safeName = String(file.file_name).replace(/[^\w.-]+/g, "_");
    const path = `orders/${orderNo}/assistant/${randomUUID()}-${safeName}`;
    const upload = await db.storage.from(MEDIA_BUCKET).upload(path, download.data, { contentType: file.mime_type ?? undefined });
    if (upload.error) throw new Error(upload.error.message);
    const { data: pub } = db.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    const insert = await db.from("order_item_media").insert({
      order_item_id: itemId,
      file_name: file.file_name,
      mime_type: file.mime_type,
      storage_path: path,
      secure_url: pub.publicUrl,
      ...by,
    });
    if (insert.error) throw new Error(insert.error.message);
    await logOrderEvent({ orderId, orderItemId: itemId, actor: ASSISTANT_ACTOR, action: "photo_uploaded", detail: { itemLabel: orderNo, fileName: file.file_name } });
  }
}

export function assistantTools(ctx: ToolContext) {
  const db = createAdminClient();
  const did = (what: string) => ctx.actions.push(what);

  return [
    betaZodTool({
      name: "get_catalog",
      description: "The products clients can order, with their ids, variants, prices when shown, and the attributes each needs.",
      inputSchema: z.object({}),
      run: async () => {
        const [categories, attributes, settings] = await Promise.all([
          db.from("product_categories").select("id, name, products(id, name, description, price, active, unit, product_variants(id, name, price, active))"),
          db.from("category_attributes").select("category_id, name, required, options").order("sort_order"),
          db.from("showroom_settings").select("show_prices").maybeSingle(),
        ]);
        if (categories.error) throw new Error(categories.error.message);
        const showPrices = !!settings.data?.show_prices;
        const price = (n: number | null) => (showPrices ? n : undefined);
        return JSON.stringify(
          (categories.data ?? []).map((c) => ({
            category: c.name,
            attributes: (attributes.data ?? []).filter((a) => a.category_id === c.id).map((a) => ({ name: a.name, required: a.required, options: a.options })),
            products: c.products
              .filter((p) => p.active)
              .map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                unit: p.unit,
                price: price(p.price),
                variants: p.product_variants.filter((v) => v.active).map((v) => ({ id: v.id, name: v.name, price: price(v.price) })),
              })),
          })),
        );
      },
    }),

    betaZodTool({
      name: "get_my_orders",
      description: "This client's latest orders: items, progress, total, paid, what's due, and the invoice link.",
      inputSchema: z.object({}),
      run: async () => {
        const { data, error } = await db
          .from("orders")
          .select("id, order_no, approval_status, quoted_price, cancelled_at, delivery_date, created_at, order_items(product, product_type, qty, production_status, stage), invoices(invoice_no, share_token)")
          .eq("client_id", ctx.client.id)
          .order("created_at", { ascending: false })
          .limit(15);
        if (error) throw new Error(error.message);
        const paid = await paidByOrders((data ?? []).map((o) => o.id));
        return JSON.stringify(
          (data ?? []).map((o) => {
            const invoice = (Array.isArray(o.invoices) ? o.invoices[0] : o.invoices) as { invoice_no: string; share_token: string } | undefined;
            const total = o.quoted_price == null ? null : Number(o.quoted_price);
            return {
              id: o.id,
              order_no: o.order_no,
              status: o.cancelled_at ? "cancelled" : o.approval_status,
              placed: o.created_at,
              delivery_date: o.delivery_date,
              items: o.order_items,
              total,
              paid: paid[o.id] ?? 0,
              due: total == null ? null : Math.max(total - (paid[o.id] ?? 0), 0),
              invoice_no: invoice?.invoice_no ?? null,
              invoice_url: invoice ? invoiceLink(invoice.share_token) : null,
            };
          }),
        );
      },
    }),

    betaZodTool({
      name: "get_my_account",
      description: "This client's wallet balance, unpaid invoices and whether they have a phone number on file.",
      inputSchema: z.object({}),
      run: async () => {
        const [wallet, unpaid] = await Promise.all([
          db.from("wallets").select("balance").eq("client_id", ctx.client.id).maybeSingle(),
          invoices.listUnpaidForClient(ctx.client.id),
        ]);
        return JSON.stringify({ name: ctx.client.name, phone_on_file: ctx.client.phone, wallet_balance: Number(wallet.data?.balance ?? 0), unpaid_invoices: unpaid });
      },
    }),

    betaZodTool({
      name: "get_my_receipts",
      description: "This client's latest payment receipts with links.",
      inputSchema: z.object({}),
      run: async () => {
        const { data, error } = await db
          .from("order_receipts")
          .select("receipt_no, amount, method, created_at, share_token, balance_after, orders(order_no)")
          .eq("client_id", ctx.client.id)
          .order("created_at", { ascending: false })
          .limit(15);
        if (error) throw new Error(error.message);
        return JSON.stringify(
          (data ?? []).map(({ share_token, ...r }) => ({ ...r, url: clientUrl(clientPath(`/receipt/${share_token}`)) })),
        );
      },
    }),

    betaZodTool({
      name: "get_pay_options",
      description: "Links to pay one of this client's orders: the invoice page (MTN, Airtel, bank), and the order's chat (its card pays from the wallet with their PIN).",
      inputSchema: z.object({ order_id: z.string() }),
      run: async ({ order_id }) => {
        const order = await ownOrder(ctx, order_id);
        if (!order) return "Refused: not this client's order.";
        const { data: invoice } = await db.from("invoices").select("share_token").eq("order_id", order.id).maybeSingle();
        const chatId = await openClientOrderThread({ type: "client", id: ctx.client.id, name: ctx.client.name }, order.id);
        return JSON.stringify({
          invoice_url: invoice ? invoiceLink(invoice.share_token) : null,
          order_chat_url: clientUrl(clientPath(chatHref(chatId))),
        });
      },
    }),

    betaZodTool({
      name: "prepare_order",
      description: "Checks an order and works out its price, then keeps it as this chat's summary to show the client. Doesn't place anything. Replaces any earlier summary.",
      inputSchema: z.object({
        items: z.array(
          z.object({
            product_id: z.string(),
            variant_id: z.string().describe("Empty when the product has no variants."),
            qty: z.number().int().positive(),
            attributes: z.record(z.string(), z.string()).describe("Attribute name to chosen value."),
            notes: z.string().describe("The client's special requests for this item, or empty."),
            attachment_ids: z.array(z.string()).describe("Ids of files the client attached in this chat for this item."),
            photo_link: z.string().describe("A link to the photos for this item, or empty."),
          }),
        ),
        delivery_date: z.string().describe("YYYY-MM-DD"),
        express: z.boolean(),
      }),
      run: async ({ items, delivery_date, express }) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(delivery_date) || delivery_date < new Date().toISOString().slice(0, 10)) {
          return "Refused: delivery_date must be today or later, as YYYY-MM-DD.";
        }
        const pending: PendingItem[] = [];
        const lines: string[] = [];
        let total = 0;
        let unknown = false;
        for (const item of items) {
          const { data: product } = await db
            .from("products")
            .select("id, name, category_id, price, active, product_variants(id, name, price, active)")
            .eq("id", item.product_id)
            .maybeSingle();
          if (!product?.active) return `Refused: product ${item.product_id} isn't in the catalog.`;
          const variant = item.variant_id ? product.product_variants.find((v) => v.id === item.variant_id && v.active) : null;
          if (item.variant_id && !variant) return `Refused: that variant isn't available for ${product.name}.`;
          const { data: defs } = await db.from("category_attributes").select("name, required").eq("category_id", product.category_id);
          const missing = (defs ?? []).filter((d) => d.required && !item.attributes[d.name]?.trim()).map((d) => d.name);
          if (missing.length) return `Refused: ${product.name} still needs: ${missing.join(", ")}.`;

          let attachmentIds: string[] = [];
          if (item.attachment_ids.length) {
            const { data: found } = await db.from("chat_attachments").select("id").eq("conversation_id", ctx.conversationId).in("id", item.attachment_ids);
            attachmentIds = (found ?? []).map((f) => f.id);
            if (attachmentIds.length !== new Set(item.attachment_ids).size) return "Refused: some attachment ids aren't in this chat.";
          }
          const link = item.photo_link.trim();
          if (link && !/^https?:\/\/\S+$/.test(link)) return "Refused: photo_link isn't a valid link.";

          const unit = (variant?.price ?? product.price) ?? (await bookListPrice(product.id, item.attributes));
          const unitPrice = unit == null ? null : Number(unit);
          if (unitPrice == null || unitPrice <= 0) unknown = true;
          else total += unitPrice * item.qty;
          lines.push(`${item.qty} × ${product.name}${variant ? ` (${variant.name})` : ""}: ${unitPrice == null ? "price to be confirmed" : formatMoney(unitPrice * item.qty)}`);
          pending.push({
            category_id: product.category_id,
            product_id: product.id,
            variant_id: item.variant_id,
            qty: item.qty,
            attributes: item.attributes,
            item_notes: item.notes,
            attachment_ids: attachmentIds,
            photo_link: link || null,
          });
        }
        if (!everyItemHasPhotos(pending)) return "Refused: every item needs its photos attached or a link first. Ask the client for them.";
        const summary = [...lines, unknown ? "Total: reception will confirm the price" : `Total: ${formatMoney(total)}`, `Needed by ${delivery_date}${express ? " (express)" : ""}`].join("\n");
        await store.setPendingOrder(ctx.conversationId, { items: pending, delivery_date, order_type: express ? "express" : "normal", summary });
        did("Prepared an order summary");
        return `Show the client this summary and ask if you should place it:\n${summary}`;
      },
    }),

    betaZodTool({
      name: "place_order",
      description: "Places the order in this chat's summary, after the client said yes to it in a new message. Approves and invoices it when every item has a price.",
      inputSchema: z.object({}),
      run: async () => {
        const pending = await store.getPendingOrder(ctx.conversationId);
        if (!pending) return "Refused: there's no order summary here. Use prepare_order first.";
        const { data: last } = await db
          .from("chat_messages")
          .select("created_at")
          .eq("conversation_id", ctx.conversationId)
          .eq("sender_type", "client")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!clientConfirmedAfter(pending.posted_at, last?.created_at ?? null)) {
          return "Refused: the client hasn't answered the summary yet. Show it and wait for their yes.";
        }
        if (!(await store.takePendingOrder(ctx.conversationId))) return "Refused: this order was already placed.";

        const res = await buildAndInsertOrder(db, {
          client: ctx.client,
          agentId: null,
          agentName: null,
          designer: null,
          route: "factory",
          orderType: pending.order_type,
          deliveryDate: pending.delivery_date,
          deadlineAt: "",
          orderNotes: "Taken in chat by the Aming assistant.",
          designerBrief: "",
          responsibleWorkerId: null,
          items: pending.items,
          releaseImmediately: false,
          actor: ASSISTANT_ACTOR,
        });
        if (!res.ok) return `Refused: ${res.error}`;
        did(`Placed order ${res.orderNo}`);

        const problems: string[] = [];
        for (const placed of res.items) {
          try {
            await photosToItem(ctx, placed.itemId, res.orderNo, res.orderId, pending.items[placed.formIndex]);
          } catch (err) {
            console.error("assistant: photos not attached:", res.orderNo, err);
            problems.push("Some photos stayed in the chat and need attaching by hand.");
          }
        }

        const { lines } = await invoices.draft(res.orderId);
        let invoiceUrl: string | null = null;
        if (canAutoApprove(lines)) {
          const received = await receiveOrder(res.orderId, ASSISTANT_ACTOR);
          if (!received.ok) {
            problems.push(received.error);
          } else {
            did(`Approved order ${res.orderNo}`);
            const invoice = await invoices.generate(
              { id: ASSISTANT_ACTOR.id, name: ASSISTANT_NAME },
              res.orderId,
              { lines: lines.map((l) => ({ itemId: l.itemId, unitPrice: l.unitPrice as number, unit: l.unit })) },
            );
            did(`Invoiced order ${res.orderNo}: ${invoice.invoiceNo}`);
            invoiceUrl = invoice.shareUrl;
          }
        }
        await tellManagers(
          invoiceUrl ? "Assistant took an order" : "New client order: needs a price",
          `Order ${res.orderNo} from ${ctx.client.name}${problems.length ? `. ${problems.join(" ")}` : ""}`,
          "/dashboard/order-approvals",
        );
        return JSON.stringify({
          order_id: res.orderId,
          order_no: res.orderNo,
          approved_and_invoiced: !!invoiceUrl,
          invoice_url: invoiceUrl,
          summary: pending.summary,
          problems,
        });
      },
    }),

    betaZodTool({
      name: "create_invoice",
      description: "Generates the invoice for one of this client's orders that reception has confirmed but not yet invoiced.",
      inputSchema: z.object({ order_id: z.string() }),
      run: async ({ order_id }) =>
        guarded(async () => {
          const order = await ownOrder(ctx, order_id);
          if (!order) return "Refused: not this client's order.";
          const { lines } = await invoices.draft(order.id);
          if (!canAutoApprove(lines)) return "Refused: some items have no price yet. Reception confirms them.";
          const invoice = await invoices.generate(
            { id: ASSISTANT_ACTOR.id, name: ASSISTANT_NAME },
            order.id,
            { lines: lines.map((l) => ({ itemId: l.itemId, unitPrice: l.unitPrice as number, unit: l.unit })) },
          );
          did(`Invoiced order ${order.order_no}: ${invoice.invoiceNo}`);
          return JSON.stringify({ invoice_no: invoice.invoiceNo, invoice_url: invoice.shareUrl, amount: invoice.amount });
        }),
    }),

    betaZodTool({
      name: "request_payment",
      description: "Sends an MTN or Airtel payment prompt to the client's phone for one of their invoiced orders, for what's still due or a part of it. Only after they agree. The money counts only once they approve it with their PIN.",
      inputSchema: z.object({
        order_id: z.string(),
        phone: z.string().describe("The number they gave, or empty for the one on file."),
        amount: z.number().int().positive().nullable().describe("Part of what's due, or null for all of it."),
      }),
      run: async ({ order_id, phone, amount }) =>
        guarded(async () => {
          const order = await ownOrder(ctx, order_id);
          if (!order) return "Refused: not this client's order.";
          const number = phone.trim() || ctx.client.phone;
          if (!number) return "Refused: no number on file. Ask which number to use.";
          const { count } = await db
            .from("provider_collections")
            .select("id", { count: "exact", head: true })
            .eq("client_id", ctx.client.id)
            .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString());
          if ((count ?? 0) >= MAX_PROMPTS_PER_DAY) return "Refused: too many prompts today. Hand to staff.";
          const sent = await startOrderPayment(
            { type: "client", id: ctx.client.id, name: ctx.client.name },
            { orderId: order.id, phone: number, ...(amount ? { amount } : {}) },
          );
          did(`Sent a payment prompt of ${formatMoney(sent.amount)} for order ${order.order_no}`);
          return JSON.stringify({ prompt_sent: true, amount: sent.amount, status: sent.status });
        }),
    }),

    betaZodTool({
      name: "hand_to_staff",
      description: "Passes this chat to the team and stops answering it until they hand it back.",
      inputSchema: z.object({ reason: z.string() }),
      run: async ({ reason }) => {
        await store.setState(ctx.conversationId, "staff");
        await tellManagers(`${ctx.client.name} needs a person`, reason, chatHref(ctx.conversationId));
        did(`Handed to staff: ${reason}`);
        return "Handed over. Tell the client someone from the team will reply here.";
      },
    }),
  ];
}
