import "server-only";

import { openClientOrderThread, postAssistantMessage } from "@repo/lib/chat/assistant";
import { formatMoney } from "@repo/lib/currency/format";
import * as invoices from "@repo/lib/invoices/server/service";
import { receiveOrder } from "@repo/lib/orders/receive";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { ASSISTANT_NAME, UPLOAD_GRACE_MS, mayAnswer, reviewOutcome } from "../core/rules";
import * as store from "./store";
import { ASSISTANT_ACTOR, tellManagers } from "./tools";

const LOOK_BACK_MS = 24 * 3_600_000;

interface OrderRow {
  id: string;
  order_no: string;
  clients: { id: string; name: string; email: string | null; phone: string | null };
  order_items: { media_link: string | null; order_item_media: { id: string }[] }[];
}

/**
 * Orders clients placed themselves, once their uploads have had time to finish:
 * well-ordered ones are approved and invoiced and the client is asked to pay;
 * otherwise the client hears what's missing, once. Run every minute by the client app.
 */
export async function reviewClientOrders(): Promise<void> {
  const settings = await store.getSettings();
  if (settings.mode === "off") return;
  const db = createAdminClient();
  const now = Date.now();
  const { data, error } = await db
    .from("orders")
    .select("id, order_no, clients(id, name, email, phone), order_items(media_link, order_item_media(id))")
    .eq("approval_status", "pending_review")
    .is("cancelled_at", null)
    .is("released_at", null)
    .not("client_id", "is", null)
    .or(`created_by_name.is.null,created_by_name.neq.${ASSISTANT_NAME}`)
    .gte("created_at", new Date(now - LOOK_BACK_MS).toISOString())
    .lt("created_at", new Date(now - UPLOAD_GRACE_MS).toISOString())
    .limit(20);
  if (error) throw new Error(error.message);

  for (const order of (data ?? []) as unknown as OrderRow[]) {
    const client = order.clients;
    if (!mayAnswer(settings.mode, settings.testClients, client)) continue;
    try {
      await reviewOne(order, client);
    } catch (err) {
      console.error("assistant review failed:", order.order_no, err);
    }
  }
}

async function reviewOne(order: OrderRow, client: OrderRow["clients"]): Promise<void> {
  const db = createAdminClient();
  const { data: done } = await db.from("assistant_order_reviews").select("asked_photos, asked_price").eq("order_id", order.id).maybeSingle();
  const { lines } = await invoices.draft(order.id);
  const outcome = reviewOutcome(lines, order.order_items.map((i) => ({ hasPhotos: !!i.media_link || i.order_item_media.length > 0 })));

  const say = async (text: string, action: string, choices: string[] = []) => {
    const conversationId = await openClientOrderThread({ type: "client", id: client.id, name: client.name }, order.id);
    await postAssistantMessage(conversationId, client.id, ASSISTANT_NAME, text, { choices, images: [] });
    await store.logRun({ conversationId, clientId: client.id, reply: text, actions: [action], error: null, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 });
  };

  if (outcome === "needs_price") {
    if (done?.asked_price) return;
    await db.from("assistant_order_reviews").upsert({ order_id: order.id, asked_price: new Date().toISOString() });
    await say(`Thank you, we've got order ${order.order_no}. Reception will confirm its price, and I'll send your invoice here as soon as they do.`, `Order ${order.order_no}: waits for reception to price it`);
    return;
  }
  if (outcome === "needs_photos") {
    if (done?.asked_photos) return;
    await db.from("assistant_order_reviews").upsert({ order_id: order.id, asked_photos: new Date().toISOString() });
    await say(`Thank you, we've got order ${order.order_no}. To print it we still need your photos: please attach them here, or send a link (Google Drive and so on).`, `Order ${order.order_no}: asked for photos`);
    return;
  }

  // Marked first, so a failure below can't approve or message twice.
  await db.from("assistant_order_reviews").upsert({ order_id: order.id, approved_at: new Date().toISOString() });
  const received = await receiveOrder(order.id, ASSISTANT_ACTOR);
  if (!received.ok) {
    await tellManagers("Assistant couldn't confirm an order", `Order ${order.order_no}: ${received.error}`, "/dashboard/order-approvals");
    return;
  }
  const invoice = await invoices.generate(
    { id: ASSISTANT_ACTOR.id, name: ASSISTANT_NAME },
    order.id,
    { lines: lines.map((l) => ({ itemId: l.itemId, unitPrice: l.unitPrice as number, unit: l.unit })) },
  );
  await say(
    `Your order ${order.order_no} is confirmed 😊 The total is ${formatMoney(invoice.amount)}.\n\nInvoice: ${invoice.shareUrl}\n\nWhich MTN or Airtel number should I send the payment prompt to?`,
    `Confirmed and invoiced order ${order.order_no}: ${invoice.invoiceNo}`,
    client.phone ? [`Use ${client.phone}`] : [],
  );
}
