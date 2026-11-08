import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { logOrderEvent, type AuditActor } from "@repo/lib/audit/log";
import { openClientOrderThread } from "@repo/lib/chat/assistant";
import { chatHref } from "@repo/lib/chat/routes";
import { clientPath, clientUrl } from "@repo/lib/client-portal/paths";
import { formatMoney } from "@repo/lib/currency/format";
import { InvoiceError } from "@repo/lib/invoices/server/errors";
import * as invoices from "@repo/lib/invoices/server/service";
import { payBeforeProduction } from "@repo/lib/agents/core";
import { buildAndInsertOrder } from "@repo/lib/orders/create";
import { receiveOrder } from "@repo/lib/orders/receive";
import { recipeListPrice } from "@repo/lib/production/pricing";
import { notifyActor } from "@repo/lib/push/send";
import { MEDIA_BUCKET } from "@repo/lib/storage/client";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { paidByOrders } from "@repo/lib/wallet/orders";
import { WalletError } from "@repo/lib/wallet/server/errors";
import { startOrderPayment } from "@repo/lib/wallet/server/mobile-money";

import { ASSISTANT_NAME, MAX_CHOICES, MAX_IMAGES, MAX_ITEM_QTY, MAX_PROMPTS_PER_DAY, STAFF_ALERT_EVERY_MS, mayAlertStaff, canAutoApprove, clientConfirmedAfter, everyItemHasPhotos } from "../core/rules";
import * as store from "./store";
import type { PendingItem } from "./store";

export const ASSISTANT_ACTOR: AuditActor = { type: "system", id: "assistant", name: ASSISTANT_NAME };

export interface ToolContext {
  conversationId: string;
  client: { id: string; name: string; email: string | null; phone: string | null };
  /** What it did, for the boss's list. */
  actions: string[];
  /** Goes out with its reply: buttons to tap, and product photos. */
  choices: string[];
  images: { url: string; name: string }[];
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

export interface CheckedItem {
  category_id: string;
  product_id: string;
  variant_id: string;
  qty: number;
  attributes: Record<string, string>;
  item_notes: string;
}

/**
 * An order's items checked against the catalog (active product and variant, required attributes, quantity)
 * and priced as the order and its invoice will be: list or recipe price, less any running offer.
 * Shared by the chat and the Alexis panel. A refusal is a sentence for the AI.
 */
export async function checkOrderItems(
  items: { product_id: string; variant_id: string; qty: number; attributes: Record<string, string>; notes: string }[],
): Promise<{ ok: false; refusal: string } | { ok: true; items: CheckedItem[]; lines: string[]; total: number; unknown: boolean }> {
  const db = createAdminClient();
  const checked: CheckedItem[] = [];
  const lines: string[] = [];
  let total = 0;
  let unknown = false;
  if (!items.length) return { ok: false, refusal: "Refused: the order has no items." };
  for (const item of items) {
    if (item.qty > MAX_ITEM_QTY) return { ok: false, refusal: `Refused: more than ${MAX_ITEM_QTY} of one item needs the team. Ask if they meant a smaller number; if not, call hand_to_staff.` };
    const { data: product } = await db
      .from("products")
      .select("id, name, category_id, price, active, product_variants(id, name, price, active)")
      .eq("id", item.product_id)
      .maybeSingle();
    if (!product?.active) return { ok: false, refusal: `Refused: product ${item.product_id} isn't in the catalog.` };
    const variant = item.variant_id ? product.product_variants.find((v) => v.id === item.variant_id && v.active) : null;
    if (item.variant_id && !variant) return { ok: false, refusal: `Refused: that variant isn't available for ${product.name}.` };
    const { data: defs } = await db.from("category_attributes").select("name, required").eq("category_id", product.category_id);
    const missing = (defs ?? []).filter((d) => d.required && !item.attributes[d.name]?.trim()).map((d) => d.name);
    if (missing.length) return { ok: false, refusal: `Refused: ${product.name} still needs: ${missing.join(", ")}.` };

    const unit = (variant?.price ?? product.price) ?? (await recipeListPrice(product.id, variant?.id ?? null, item.attributes));
    // The running offer, decided by the database as it will be on the order and its invoice.
    const offer = unit == null ? null : await db.rpc("discount_offer", { p_product: product.id, p_list_price: unit, p_at: new Date().toISOString() });
    const unitPrice = unit == null ? null : Number((offer?.data as { price?: number } | null)?.price ?? unit);
    if (unitPrice == null || unitPrice <= 0) unknown = true;
    else total += unitPrice * item.qty;
    lines.push(`${item.qty} × ${product.name}${variant ? ` (${variant.name})` : ""}: ${unitPrice == null ? "price to be confirmed" : formatMoney(unitPrice * item.qty)}`);
    checked.push({ category_id: product.category_id, product_id: product.id, variant_id: item.variant_id, qty: item.qty, attributes: item.attributes, item_notes: item.notes });
  }
  return { ok: true, items: checked, lines, total, unknown };
}

/** A tool, whichever AI is calling it. */
export interface AssistantTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  run: (input: never) => Promise<string>;
}

function tool<S extends z.ZodType>(t: { name: string; description: string; inputSchema: S; run: (input: z.infer<S>) => Promise<string> }): AssistantTool {
  return t as unknown as AssistantTool;
}

export function assistantTools(ctx: ToolContext): AssistantTool[] {
  const db = createAdminClient();
  const did = (what: string) => ctx.actions.push(what);

  const tools = [
    tool({
      name: "offer_choices",
      description: "Puts tappable buttons under your reply. Use whenever the client picks from a short list or answers yes or no. Still write the question in your reply.",
      inputSchema: z.object({ options: z.array(z.string()).describe(`At most ${MAX_CHOICES} short answers, in the client's words.`) }),
      run: async ({ options }) => {
        ctx.choices = [...new Set(options.map((o) => o.trim()).filter(Boolean))].slice(0, MAX_CHOICES).map((o) => o.slice(0, 60));
        return "The buttons will show under your reply.";
      },
    }),

    tool({
      name: "show_product_photos",
      description: "Puts photos of a product under your reply. Use when the client asks for samples or to see something.",
      inputSchema: z.object({ product_id: z.string() }),
      run: async ({ product_id }) => {
        const [product, media] = await Promise.all([
          db.from("products").select("name, display_image_url").eq("id", product_id).maybeSingle(),
          db.from("product_media").select("secure_url, kind").eq("product_id", product_id).order("sort_order").limit(MAX_IMAGES * 2),
        ]);
        if (!product.data) return "Refused: that product isn't in the catalog.";
        const urls = [product.data.display_image_url, ...(media.data ?? []).filter((m) => m.kind !== "video").map((m) => m.secure_url)].filter(Boolean) as string[];
        const fresh = urls.filter((url) => !ctx.images.some((i) => i.url === url));
        if (!urls.length) return `There are no photos of ${product.data.name} here. Say so, point to the Showroom, and offer to ask the team.`;
        ctx.images = [...ctx.images, ...[...new Set(fresh)].map((url) => ({ url, name: product.data!.name }))].slice(0, MAX_IMAGES);
        return `${ctx.images.length} photos will show under your reply. Don't list their links.`;
      },
    }),

    tool({
      name: "get_typical_times",
      description: "How many days each kind of product has really taken lately, from order placed to done. Typical, not a promise.",
      inputSchema: z.object({}),
      run: async () => {
        const { data, error } = await db.rpc("assistant_typical_days");
        if (error) throw new Error(error.message);
        return JSON.stringify(data ?? []);
      },
    }),

    tool({
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

    tool({
      name: "get_prices",
      description: "A product's real price today for each size or type, with any running offer already taken off. Use for every price question.",
      inputSchema: z.object({ product_id: z.string() }),
      run: async ({ product_id }) => {
        const [product, settings] = await Promise.all([
          db.from("products").select("id, name, price, active, product_variants(name, price, active)").eq("id", product_id).maybeSingle(),
          db.from("showroom_settings").select("show_prices").maybeSingle(),
        ]);
        if (!product.data?.active) return "Refused: that product isn't in the catalog.";
        if (!settings.data?.show_prices) return "Prices aren't shown to clients at the moment. Say reception will confirm the price.";
        const at = new Date().toISOString();
        const priced = await Promise.all(
          [...product.data.product_variants.filter((v) => v.active), ...(product.data.product_variants.length ? [] : [{ name: product.data.name, price: product.data.price }])]
            .filter((v) => v.price != null)
            .map(async (v) => {
              const offer = await db.rpc("discount_offer", { p_product: product_id, p_list_price: v.price, p_at: at });
              const price = Number((offer.data as { price?: number } | null)?.price ?? v.price);
              return { size: v.name, price, label: `${v.name} – ${formatMoney(price)}` };
            }),
        );
        if (!priced.length) return `${product.data.name} has no set price; it depends on what's chosen. Say reception will confirm it.`;
        priced.sort((a, b) => a.price - b.price);
        return JSON.stringify({ product: product.data.name, from: formatMoney(priced[0].price), sizes: priced });
      },
    }),

    tool({
      name: "get_my_orders",
      description: "This client's latest orders: items, progress, total, paid, what's due, the invoice link, and for an order placed through a sales agent, what must be paid before production.",
      inputSchema: z.object({}),
      run: async () => {
        const { data, error } = await db
          .from("orders")
          .select("id, order_no, approval_status, quoted_price, placed_by_agent, released_at, cancelled_at, delivery_date, created_at, order_items(product, product_type, qty, production_status, stage), invoices(invoice_no, share_token)")
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
              // Through a sales agent: production starts once 80% is paid (packages/lib/agents).
              ...(o.placed_by_agent && !o.released_at
                ? { through_agent: true, pay_before_production: total == null ? "80% of the price, once confirmed" : payBeforeProduction(total) }
                : {}),
              invoice_no: invoice?.invoice_no ?? null,
              invoice_url: invoice ? invoiceLink(invoice.share_token) : null,
            };
          }),
        );
      },
    }),

    tool({
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

    tool({
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

    tool({
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

    tool({
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
        const checked = await checkOrderItems(items);
        if (!checked.ok) return checked.refusal;
        const { lines, total, unknown } = checked;
        const pending: PendingItem[] = [];
        for (const [n, item] of items.entries()) {
          let attachmentIds: string[] = [];
          if (item.attachment_ids.length) {
            const { data: found } = await db.from("chat_attachments").select("id").eq("conversation_id", ctx.conversationId).in("id", item.attachment_ids);
            attachmentIds = (found ?? []).map((f) => f.id);
            if (attachmentIds.length !== new Set(item.attachment_ids).size) return "Refused: some attachment ids aren't in this chat.";
          }
          const link = item.photo_link.trim();
          if (link && !/^https?:\/\/\S+$/.test(link)) return "Refused: photo_link isn't a valid link.";
          pending.push({ ...checked.items[n], attachment_ids: attachmentIds, photo_link: link || null });
        }
        if (!everyItemHasPhotos(pending)) return "Refused: every item needs its photos attached or a link first. Ask the client for them.";
        const summary = [...lines, unknown ? "Total: reception will confirm the price" : `Total: ${formatMoney(total)}`, `Needed by ${delivery_date}${express ? " (express)" : ""}`].join("\n");
        const order_type = express ? "express" : "normal";
        // The same order again: the client has still seen it, so their yes still counts.
        const earlier = await store.getPendingOrder(ctx.conversationId);
        const same =
          !!earlier?.posted_at && JSON.stringify([earlier.items, earlier.delivery_date, earlier.order_type]) === JSON.stringify([pending, delivery_date, order_type]);
        if (same) return "The client has already seen this exact summary. If they agreed to it, call place_order now.";
        await store.setPendingOrder(ctx.conversationId, { items: pending, delivery_date, order_type, summary });
        did("Prepared an order summary");
        return `Show the client this summary and ask if you should place it:\n${summary}`;
      },
    }),

    tool({
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
          orderNotes: `Taken in chat by ${ASSISTANT_NAME}.`,
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
        let invoiceTotal: number | null = null;
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
            invoiceTotal = invoice.amount;
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
          total: invoiceTotal,
          summary: pending.summary,
          problems,
        });
      },
    }),

    tool({
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

    tool({
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

    tool({
      name: "add_photos_to_order",
      description: "Puts files the client attached in this chat, or a link, on one of their orders that still needs photos. It's then confirmed and invoiced automatically within a minute or two if it's well ordered.",
      inputSchema: z.object({ order_id: z.string(), attachment_ids: z.array(z.string()), photo_link: z.string().describe("A link, or empty.") }),
      run: async ({ order_id, attachment_ids, photo_link }) => {
        const order = await ownOrder(ctx, order_id);
        if (!order) return "Refused: not this client's order.";
        const link = photo_link.trim();
        if (link && !/^https?:\/\/\S+$/.test(link)) return "Refused: that isn't a valid link.";
        if (!attachment_ids.length && !link) return "Refused: no files or link given.";
        const { data: items } = await db.from("order_items").select("id, media_link, order_item_media(id), order_item_drive_links(id)").eq("order_id", order.id);
        const missing = (items ?? []).filter((i) => !i.media_link && !i.order_item_media.length && !i.order_item_drive_links.length);
        for (const item of missing) {
          await photosToItem(ctx, item.id, order.order_no, order.id, { attachment_ids, photo_link: link || null } as PendingItem);
        }
        did(`Added photos to order ${order.order_no}`);
        return "Added. Tell the client the order will be confirmed and invoiced here shortly if everything's in order.";
      },
    }),

    tool({
      name: "hand_to_staff",
      description: "Tells the team this chat needs a person. You keep answering until one of them writes.",
      inputSchema: z.object({ reason: z.string() }),
      run: async ({ reason }) => {
        const { data: recent } = await db
          .from("assistant_runs")
          .select("actions")
          .eq("conversation_id", ctx.conversationId)
          .gte("created_at", new Date(Date.now() - STAFF_ALERT_EVERY_MS).toISOString());
        const lately = [...ctx.actions, ...(recent ?? []).flatMap((r) => r.actions as string[])];
        if (!mayAlertStaff(lately)) return "The team was already told about this chat a short while ago. Don't repeat that to the client unless they ask; carry on helping.";
        await tellManagers(`${ctx.client.name} needs a person`, reason, chatHref(ctx.conversationId));
        did(`Asked staff: ${reason}`);
        return "The team has been told. Say someone will reply here, and keep helping with anything else until they do.";
      },
    }),
  ];

  // Refusals go on the boss's list, so a stuck chat can be seen for what it is.
  return tools.map((t) => ({
    ...t,
    run: async (input: never) => {
      const result = await t.run(input);
      if (/^(Refused|Failed)/.test(result)) did(`${t.name}: ${result}`);
      return result;
    },
  }));
}
