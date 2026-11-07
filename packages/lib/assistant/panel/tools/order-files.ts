import "server-only";

import { z } from "zod";

import { createAdminClient } from "@repo/lib/supabase/admin";

import { changeTool, type ChangeTool } from "../toolbox";

// "Add these photos to my order": the person attaches files in Alexis (they
// stay on their device), Alexis prepares this card, and once it's confirmed
// the device uploads them to the order item through the same path as the
// order's own Add photos button (uploadFileToStorage, which checks again on
// the server who may add files to that item).

interface ItemRow {
  id: string;
  product: string;
  product_type: string | null;
}

/** The order's items in order, if the order exists and (for a client) is theirs and isn't cancelled. */
async function orderItems(orderNo: string, clientId: string | null): Promise<{ orderNo: string; items: ItemRow[] }> {
  let query = createAdminClient()
    .from("orders")
    .select("order_no, client_id, cancelled_at, order_items(id, product, product_type, created_at)")
    .eq("order_no", orderNo.trim());
  if (clientId) query = query.eq("client_id", clientId);
  const { data, error } = await query.maybeSingle<{ order_no: string; cancelled_at: string | null; order_items: (ItemRow & { created_at: string })[] }>();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`There's no order ${orderNo}${clientId ? " on their account" : ""}.`);
  if (data.cancelled_at) throw new Error(`Order ${data.order_no} was cancelled.`);
  return { orderNo: data.order_no, items: [...data.order_items].sort((a, b) => a.created_at.localeCompare(b.created_at)) };
}

const label = (i: ItemRow) => (i.product_type ? `${i.product} (${i.product_type})` : i.product);

const input = z.object({
  orderNo: z.string().min(1).max(40).describe("The order number."),
  itemNumber: z.number().int().min(1).nullable().describe("Which item on the order, counting from 1, when it has more than one."),
  itemId: z.string().uuid().nullable().describe("Leave null; filled in when the card is prepared."),
});

/** `clientId`: only that client's own orders; null for staff, who may add files to any order. */
export function addFilesToOrderTool(clientId: string | null): ChangeTool {
  async function pick(i: z.infer<typeof input>) {
    const { orderNo, items } = await orderItems(i.orderNo, clientId);
    if (!items.length) throw new Error(`Order ${orderNo} has no items.`);
    if (items.length > 1 && !i.itemNumber) throw new Error(`Order ${orderNo} has ${items.length} items: ${items.map((it, n) => `${n + 1}. ${label(it)}`).join("; ")}. Ask which one.`);
    const item = items.at((i.itemNumber ?? 1) - 1);
    if (!item) throw new Error(`Order ${orderNo} has only ${items.length} items.`);
    return { orderNo, item };
  }
  return changeTool({
    name: "add_files_to_order",
    description:
      "Add the files the person attached to their message (photos to print, designs) to an item on an order. The files upload from their device once they confirm.",
    inputSchema: input,
    card: async (i) => {
      const { orderNo, item } = await pick(i);
      // The card remembers the item, so Confirm uploads to exactly what it showed.
      i.itemId = item.id;
      return { title: `Add the attached files to order ${orderNo}`, lines: [`Item: ${label(item)}`, "They upload from this device after you confirm."] };
    },
    run: async (i) => {
      const { item } = await pick(i);
      if (i.itemId && i.itemId !== item.id) return { ok: false, error: "The order changed since this card was made. Ask Alexis again." };
      return { ok: true, done: "Uploading the files now. Keep this page open until they finish." };
    },
    uploadsTo: (i) => i.itemId ?? "",
  });
}
