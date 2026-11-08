import "server-only";

import { z } from "zod";

import { logOrderEvent, type AuditActor } from "@repo/lib/audit/log";
import { formatMoney } from "@repo/lib/currency/format";
import { InvoiceError } from "@repo/lib/invoices/server/errors";
import * as invoices from "@repo/lib/invoices/server/service";
import { buildAndInsertOrder } from "@repo/lib/orders/create";
import { receiveOrder } from "@repo/lib/orders/receive";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { paidByOrders } from "@repo/lib/wallet/orders";
import { WalletError } from "@repo/lib/wallet/server/errors";
import { startOrderPayment } from "@repo/lib/wallet/server/mobile-money";
import { payOrdersFromWallet, payOrdersWithMobileMoney, topUpWithMobileMoney } from "@repo/lib/wallet/actions";

import { ASSISTANT_NAME, canAutoApprove, MAX_PROMPTS_PER_DAY } from "../../core/rules";
import { ASSISTANT_ACTOR, checkOrderItems, tellManagers } from "../../server/tools";
import type { Person } from "../server";
import { changeTool, readTool, type ChangeTool } from "../toolbox";
import type { AssistantTool } from "../../server/tools";
import { explainListPrice } from "@repo/lib/production/pricing";

// A client's orders through Alexis, as the chat assistant takes them
// (server/tools.ts): place an order, invoice it, ask for payment. Each is a
// card the client confirms, which is their yes. The order is checked and
// priced by the chat's own checkOrderItems, placed by buildAndInsertOrder,
// approved by receiveOrder and invoiced by the invoice service, exactly as
// in the chat. Photos come as a link, or as files attached in Alexis that
// upload from the client's device once the order exists; then the order
// form's review (server/review.ts) confirms and invoices it in the order's
// chat once they're in, as for an order from the order form.

const item = z.object({
  product_id: z.string(),
  variant_id: z.string().describe("Empty when the product has no variants."),
  qty: z.number().int().positive(),
  attributes: z.record(z.string(), z.string()).describe("Attribute name to chosen value."),
  notes: z.string().describe("The client's special requests for this item, or empty."),
  photo_link: z.string().describe("A link to the photos for this item (Google Drive and so on), or empty."),
  uses_attached_files: z.boolean().describe("The photos for this item are the files attached to their latest message. At most one item."),
});

const placeInput = z.object({
  items: z.array(item).min(1).max(20),
  delivery_date: z.string().describe("YYYY-MM-DD, today or later."),
  express: z.boolean(),
});

type PlaceInput = z.infer<typeof placeInput>;

/** Everything the card and Confirm both check: catalog, prices, date, photos. Throws a sentence. */
async function checkPlace(i: PlaceInput, attached: number | null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.delivery_date) || i.delivery_date < new Date().toISOString().slice(0, 10)) throw new Error("The delivery date must be today or later.");
  const onDevice = i.items.filter((it) => it.uses_attached_files);
  if (onDevice.length > 1) throw new Error("Attached files can go to one item only. Ask for a link for the others, or place them as separate orders.");
  if (onDevice.length && attached === 0) throw new Error("No files are attached to their latest message. Ask them to tap Attach and choose the photos.");
  for (const it of i.items) {
    const link = it.photo_link.trim();
    if (link && !/^https?:\/\/\S+$/.test(link)) throw new Error("That photo link isn't a valid link.");
    if (!link && !it.uses_attached_files) throw new Error("Every item needs its photos: attached here or a link. Ask the client for them.");
  }
  const checked = await checkOrderItems(i.items);
  if (!checked.ok) throw new Error(checked.refusal.replace(/^Refused: /, ""));
  return checked;
}

async function ownOrder(clientId: string, orderNo: string) {
  const { data } = await createAdminClient()
    .from("orders")
    .select("id, order_no, quoted_price, cancelled_at")
    .eq("order_no", orderNo.trim())
    .eq("client_id", clientId)
    .maybeSingle();
  if (!data) throw new Error(`There's no order ${orderNo} on their account.`);
  if (data.cancelled_at) throw new Error(`Order ${data.order_no} was cancelled.`);
  return data;
}

/** A refusal from the invoice or wallet services is a sentence for the person. */
async function guarded<T>(work: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof WalletError || err instanceof InvoiceError) return { ok: false, error: err.message };
    throw err;
  }
}

export function clientOrderTools(person: Person): ChangeTool[] {
  const client = { id: person.id, name: person.name, email: person.email, phone: person.phone };
  const actor: AuditActor = { type: "client", id: person.id, name: person.name };

  const place = changeTool({
    name: "place_order",
    description:
      "Place an order for the client: their products and choices from get_catalog, the date they need it, and photos for every item (a link, or the files attached to their latest message). Once they confirm, it's approved and invoiced straight away when every item has a price and its photos; with attached files, it's confirmed and invoiced as soon as they finish uploading.",
    inputSchema: placeInput,
    card: async (i, { attached }) => {
      const checked = await checkPlace(i, attached);
      const photos = i.items.some((it) => it.uses_attached_files) ? [`Photos: the ${attached} attached file${attached === 1 ? "" : "s"}, uploaded from this device after you confirm`] : [];
      return {
        title: `Place your order${checked.unknown ? "" : `: ${formatMoney(checked.total)}`}`,
        lines: [
          ...checked.lines,
          checked.unknown ? "Total: reception will confirm the price" : `Total: ${formatMoney(checked.total)}`,
          `Needed by ${i.delivery_date}${i.express ? " (express)" : ""}`,
          ...photos,
        ],
      };
    },
    run: async (i) => {
      const checked = await checkPlace(i, null);
      const db = createAdminClient();
      const res = await buildAndInsertOrder(db, {
        client,
        agentId: null,
        agentName: null,
        designer: null,
        route: "factory",
        orderType: i.express ? "express" : "normal",
        deliveryDate: i.delivery_date,
        deadlineAt: "",
        orderNotes: `Placed through ${ASSISTANT_NAME}.`,
        designerBrief: "",
        responsibleWorkerId: null,
        items: checked.items.map((c, n) => ({ ...c, attachment_ids: [], photo_link: i.items[n].photo_link.trim() || null })),
        releaseImmediately: false,
        // Placed as the client: an order waiting for its uploads is then confirmed by the order form's review.
        actor,
      });
      if (!res.ok) return { ok: false, error: res.error };

      let uploadItemId: string | undefined;
      for (const placed of res.items) {
        const asked = i.items[placed.formIndex];
        const link = asked.photo_link.trim();
        if (link) {
          const { error } = await db.from("order_item_media").insert({
            order_item_id: placed.itemId,
            file_name: link,
            secure_url: link,
            uploaded_by_type: "client",
            uploaded_by_id: person.id,
            uploaded_by_name: person.name,
            uploaded_by_role: null,
          });
          if (error) throw new Error(error.message);
          await logOrderEvent({ orderId: res.orderId, orderItemId: placed.itemId, actor, action: "link_added", detail: { itemLabel: res.orderNo } });
        }
        if (asked.uses_attached_files) uploadItemId = placed.itemId;
      }

      if (uploadItemId) {
        await tellManagers("New client order", `Order ${res.orderNo} from ${person.name}, placed through ${ASSISTANT_NAME}; photos uploading`, "/dashboard/order-approvals");
        return {
          ok: true,
          done: `Order ${res.orderNo} is placed. Your photos are uploading below: keep this open until they finish. Then it's confirmed and your invoice comes in the order's chat.`,
          uploadItemId,
        };
      }
      const { lines } = await invoices.draft(res.orderId);
      if (!canAutoApprove(lines)) {
        await tellManagers("New client order: needs a price", `Order ${res.orderNo} from ${person.name}, placed through ${ASSISTANT_NAME}`, "/dashboard/order-approvals");
        return { ok: true, done: `Order ${res.orderNo} is placed. Reception will confirm its price and send your invoice.` };
      }
      const received = await receiveOrder(res.orderId, ASSISTANT_ACTOR);
      if (!received.ok) {
        await tellManagers("Alexis couldn't confirm an order", `Order ${res.orderNo}: ${received.error}`, "/dashboard/order-approvals");
        return { ok: true, done: `Order ${res.orderNo} is placed. Reception will confirm it and send your invoice.` };
      }
      const invoice = await invoices.generate({ id: ASSISTANT_ACTOR.id, name: ASSISTANT_NAME }, res.orderId, {
        lines: lines.map((l) => ({ itemId: l.itemId, unitPrice: l.unitPrice as number, unit: l.unit })),
      });
      await tellManagers("Alexis took an order", `Order ${res.orderNo} from ${person.name}: ${formatMoney(invoice.amount)}`, "/dashboard/order-approvals");
      return { ok: true, done: `Order ${res.orderNo} is confirmed. Total ${formatMoney(invoice.amount)}. Invoice: ${invoice.shareUrl}` };
    },
  });

  const invoice = changeTool({
    name: "create_invoice",
    description: "Create the invoice for one of the client's orders that reception has priced but not yet invoiced.",
    inputSchema: z.object({ orderNo: z.string().min(1).max(40) }),
    card: async ({ orderNo }) => {
      const order = await ownOrder(person.id, orderNo);
      const { lines } = await invoices.draft(order.id);
      if (!canAutoApprove(lines)) throw new Error("Some items have no price yet. Reception confirms them.");
      const total = lines.reduce((s, l) => s + (l.unitPrice as number) * l.qty, 0);
      return { title: `Create the invoice for order ${order.order_no}: ${formatMoney(total)}`, lines: [] };
    },
    run: async ({ orderNo }) =>
      guarded(async () => {
        const order = await ownOrder(person.id, orderNo);
        const { lines } = await invoices.draft(order.id);
        if (!canAutoApprove(lines)) return { ok: false as const, error: "Some items have no price yet." };
        const made = await invoices.generate({ id: ASSISTANT_ACTOR.id, name: ASSISTANT_NAME }, order.id, {
          lines: lines.map((l) => ({ itemId: l.itemId, unitPrice: l.unitPrice as number, unit: l.unit })),
        });
        return { ok: true as const, done: `Invoice ${made.invoiceNo}: ${formatMoney(made.amount)}. ${made.shareUrl}` };
      }),
  });

  const pay = changeTool({
    name: "request_payment",
    description:
      "Send an MTN or Airtel payment prompt to the client's phone for one of their invoiced orders: what's still due, or part of it. The money counts only once they approve it with their PIN.",
    inputSchema: z.object({
      orderNo: z.string().min(1).max(40),
      phone: z.string().max(20).nullable().describe("The number they gave, or null for the one on file."),
      amount: z.number().int().positive().nullable().describe("Part of what's due in UGX, or null for all of it."),
    }),
    card: async ({ orderNo, phone, amount }) => {
      const order = await ownOrder(person.id, orderNo);
      const { data: inv } = await createAdminClient().from("invoices").select("invoice_no").eq("order_id", order.id).maybeSingle();
      if (!inv) throw new Error(`Order ${order.order_no} has no invoice yet.`);
      const total = Number(order.quoted_price ?? 0);
      const due = Math.max(total - ((await paidByOrders([order.id]))[order.id] ?? 0), 0);
      if (!due) throw new Error(`Order ${order.order_no} is already paid.`);
      if (amount && amount > due) throw new Error(`Only ${formatMoney(due)} is due on order ${order.order_no}.`);
      const number = phone?.trim() || client.phone;
      if (!number) throw new Error("There's no number on file. Ask which MTN or Airtel number to use.");
      return {
        title: `Send a payment prompt of ${formatMoney(amount ?? due)} to ${number}`,
        lines: [`Order ${order.order_no}, invoice ${inv.invoice_no}`, "You approve it on your phone with your PIN. No fee on top."],
      };
    },
    run: async ({ orderNo, phone, amount }) =>
      guarded(async () => {
        const order = await ownOrder(person.id, orderNo);
        const number = phone?.trim() || client.phone;
        if (!number) return { ok: false as const, error: "There's no number on file." };
        const { count } = await createAdminClient()
          .from("provider_collections")
          .select("id", { count: "exact", head: true })
          .eq("client_id", person.id)
          .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString());
        if ((count ?? 0) >= MAX_PROMPTS_PER_DAY) return { ok: false as const, error: "Too many payment prompts today. Pay from the invoice page, or ask the team." };
        const sent = await startOrderPayment({ type: "client", id: person.id, name: person.name }, { orderId: order.id, phone: number, ...(amount ? { amount } : {}) });
        return { ok: true as const, done: `A prompt of ${formatMoney(sent.amount)} went to ${number}. Approve it on your phone with your PIN.` };
      }),
  });

  return [place, invoice, pay];
}

/** The client's invoiced orders with something still due, oldest first. */
async function unpaidInvoiced(clientId: string): Promise<{ id: string; order_no: string; due: number }[]> {
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("id, order_no, quoted_price, created_at, invoices!inner(id)")
    .eq("client_id", clientId)
    .is("cancelled_at", null)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; order_no: string; quoted_price: number | null }[];
  const paid = await paidByOrders(rows.map((r) => r.id));
  return rows.map((r) => ({ id: r.id, order_no: r.order_no, due: Math.max(Number(r.quoted_price ?? 0) - (paid[r.id] ?? 0), 0) })).filter((r) => r.due > 0);
}

async function promptsToday(clientId: string): Promise<number> {
  const { count } = await createAdminClient()
    .from("provider_collections")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString());
  return count ?? 0;
}

/**
 * Topping up the wallet and paying every invoice at once, through the wallet's own actions (the same as its
 * buttons): a mobile money prompt the client approves with their PIN, or paying from the wallet, which needs
 * the wallet unlocked as in the app.
 */
export function walletTools(person: Person): ChangeTool[] {
  const phoneOf = (phone: string | null) => phone?.trim() || person.phone;

  const topUp = changeTool({
    name: "top_up_wallet",
    description: "Top up the client's Aming wallet by mobile money (MTN or Airtel): a prompt for the amount goes to their phone, and the money lands in the wallet once they approve it with their PIN.",
    inputSchema: z.object({
      amount: z.number().int().min(500).max(10_000_000).describe("In UGX."),
      phone: z.string().max(20).nullable().describe("The number they gave, or null for the one on file."),
    }),
    card: async ({ amount, phone }) => {
      const number = phoneOf(phone);
      if (!number) throw new Error("There's no number on file. Ask which MTN or Airtel number to use.");
      return { title: `Top up your wallet: ${formatMoney(amount)} from ${number}`, lines: ["You approve it on your phone with your PIN."] };
    },
    run: async ({ amount, phone }) => {
      const number = phoneOf(phone);
      if (!number) return { ok: false, error: "There's no number on file." };
      if ((await promptsToday(person.id)) >= MAX_PROMPTS_PER_DAY) return { ok: false, error: "Too many payment prompts today. Try again tomorrow, or ask the team." };
      const res = await topUpWithMobileMoney(amount, number);
      return res.ok ? { ok: true, done: `A prompt of ${formatMoney(amount)} went to ${number}. Approve it with your PIN and it lands in your wallet.` } : { ok: false, error: res.error };
    },
  });

  const payAll = changeTool({
    name: "pay_all_invoices",
    description:
      "Pay everything still due on all of the client's invoices at once: by one mobile money prompt (MTN or Airtel), or from their Aming wallet balance (oldest first, as far as the balance goes; their wallet must be unlocked with their PIN in the app).",
    inputSchema: z.object({
      method: z.enum(["mobile_money", "wallet"]),
      phone: z.string().max(20).nullable().describe("For mobile money: the number they gave, or null for the one on file."),
    }),
    card: async ({ method, phone }) => {
      const due = await unpaidInvoiced(person.id);
      if (!due.length) throw new Error("Nothing is due on their invoices.");
      const total = due.reduce((s, o) => s + o.due, 0);
      const lines = due.slice(0, 8).map((o) => `Order ${o.order_no}: ${formatMoney(o.due)}`);
      if (due.length > 8) lines.push(`and ${due.length - 8} more`);
      if (method === "wallet") return { title: `Pay ${formatMoney(total)} from your wallet`, lines: [...lines, "Oldest first, as far as your balance goes."] };
      const number = phoneOf(phone);
      if (!number) throw new Error("There's no number on file. Ask which MTN or Airtel number to use.");
      return { title: `Pay all your invoices: one prompt of ${formatMoney(total)} to ${number}`, lines: [...lines, "You approve it on your phone with your PIN."] };
    },
    run: async ({ method, phone }) => {
      const due = await unpaidInvoiced(person.id);
      if (!due.length) return { ok: false, error: "Nothing is due any more." };
      const ids = due.map((o) => o.id);
      if (method === "wallet") {
        const res = await payOrdersFromWallet(ids);
        if (!res.ok) return { ok: false, error: res.error };
        return { ok: true, done: `Paid ${formatMoney(res.data.paidNow)} from your wallet. Balance left: ${formatMoney(res.data.balance)}.` };
      }
      const number = phoneOf(phone);
      if (!number) return { ok: false, error: "There's no number on file." };
      if ((await promptsToday(person.id)) >= MAX_PROMPTS_PER_DAY) return { ok: false, error: "Too many payment prompts today. Pay from the invoice page, or ask the team." };
      const res = await payOrdersWithMobileMoney(ids, number);
      return res.ok ? { ok: true, done: `A prompt of ${formatMoney(res.data.amount)} went to ${number}. Approve it on your phone with your PIN.` } : { ok: false, error: res.error };
    },
  });

  return [topUp, payAll];
}

/**
 * "How did you get that price?": a photo book priced from its recipe, part by part at selling prices (never a
 * cost or the margin); anything else, its catalog price and any running offer, from the chat's own checks.
 */
export function explainPriceTool(): AssistantTool {
  return readTool({
    name: "explain_price",
    description:
      "Explain how a product's price is made up for the client's choices: a photo book part by part (sheets × price per sheet, cover, lamination, packaging), anything else its price and any offer. Use the same product, variant and attributes as the order.",
    inputSchema: z.object({
      product_id: z.string(),
      variant_id: z.string().describe("Empty when the product has no variants."),
      qty: z.number().int().positive(),
      attributes: z.record(z.string(), z.string()).describe("Attribute name to chosen value."),
    }),
    run: async ({ product_id, variant_id, qty, attributes }) => {
      const checked = await checkOrderItems([{ product_id, variant_id, qty, attributes, notes: "" }]);
      if (!checked.ok) return checked.refusal;
      const book = await explainListPrice(product_id, variant_id || null, attributes);
      if (!book) return { line: checked.lines[0], priceToBeConfirmed: checked.unknown, note: "Its catalog price (less any running offer) × the quantity." };
      return {
        forOneBook: {
          parts: book.parts.map((p) => `${p.name}: ${p.qty} × ${formatMoney(p.each)} = ${formatMoney(p.total)}`),
          addOns: book.addOns.map((a) => `${a.name}: ${formatMoney(a.price)}`),
          total: formatMoney(book.price),
        },
        quantity: qty,
        orderLine: checked.lines[0],
        partsWithNoPriceYet: book.notSet,
        note: "Selling prices only. Never guess or mention costs or margins. A running offer may make the order line lower than the book's total.",
      };
    },
  });
}
