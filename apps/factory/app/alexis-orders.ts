import "server-only";

import { z } from "zod";

import { changeTool, outcome, readTool, type ChangeTool } from "@repo/lib/assistant/panel/toolbox";
import type { AssistantTool } from "@repo/lib/assistant/server/tools";
import { generateInvoice, getInvoiceDraft, getInvoiceForOrder } from "@repo/lib/invoices/actions";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { can, type Access } from "@repo/lib/staff-access/core";
import { STATUS_LABELS, type ProductionStatus } from "@repo/lib/types";

import { assignItem, cancelOrder, receiveClientOrder, renameClientOnOrder, routeApprovedOrder, setAgreedUnitPrice, setLineDiscount, setOrderAmount, updateOrderItem } from "./dashboard/actions";
import { advanceStatus, clearDelay, flagDelay } from "./factory/actions";
import { advanceItemToFactory, completeDesignerWork } from "./graphics/actions";

// Orders and production through Alexis (2026-11-10): what reception, the
// boss, workers and designers do on their pages, prepared as cards. Each runs
// the page's own server action, which checks the person again on Confirm.

const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date as YYYY-MM-DD.");
const id = z.string().uuid();

interface OrderRow {
  id: string;
  order_no: string;
  client_name: string | null;
  approval_status: string;
  released_at: string | null;
  cancelled_at: string | null;
  delivery_date: string | null;
  quoted_price: number | null;
}

async function orderFor(orderId: string): Promise<OrderRow> {
  const { data } = await createAdminClient()
    .from("orders")
    .select("id, order_no, client_name, approval_status, released_at, cancelled_at, delivery_date, quoted_price")
    .eq("id", orderId)
    .maybeSingle<OrderRow>();
  if (!data) throw new Error("That order doesn't exist. Look it up again with find_orders.");
  if (data.cancelled_at) throw new Error(`Order ${data.order_no} was cancelled.`);
  return data;
}

interface ItemRow {
  id: string;
  product: string;
  product_type: string | null;
  qty: number;
  production_status: ProductionStatus;
  category_id: string;
  product_id: string;
  variant_id: string | null;
  attributes: Record<string, string> | null;
  list_unit_price: number | null;
  assigned_worker_id: string | null;
  order: { id: string; order_no: string; client_name: string | null; order_type: string | null; delivery_date: string | null; deadline_at: string | null; cancelled_at: string | null };
}

async function itemFor(itemId: string): Promise<ItemRow> {
  const { data } = await createAdminClient()
    .from("order_items")
    .select(
      "id, product, product_type, qty, production_status, category_id, product_id, variant_id, attributes, list_unit_price, assigned_worker_id, order:orders!inner (id, order_no, client_name, order_type, delivery_date, deadline_at, cancelled_at)",
    )
    .eq("id", itemId)
    .maybeSingle<ItemRow>();
  if (!data) throw new Error("That item doesn't exist. Look the order up again.");
  if (data.order.cancelled_at) throw new Error(`Order ${data.order.order_no} was cancelled.`);
  return data;
}

const itemName = (i: Pick<ItemRow, "product" | "product_type">) => (i.product_type ? `${i.product} (${i.product_type})` : i.product);
const stage = (o: Pick<OrderRow, "approval_status" | "released_at">) =>
  o.released_at ? "in production" : o.approval_status === "approved" ? "confirmed, not sent to production yet" : "not confirmed yet";

/** Whoever reaches Orders: everything on Orders, Client Orders and the board (changes at manage). */
function managerTools(v: { access: Access }): { read: AssistantTool[]; change: ChangeTool[] } {
  const read = [
    readTool({
      name: "order_details",
      description:
        "One order in full, by its id from find_orders: stage (not confirmed, confirmed, in production), delivery date, each item with its id, details (size, sheets…), quantity, status, worker, agreed price and discount, and its invoice (number, amount, paid, balance) or, without one, the lines and prices an invoice would have.",
      inputSchema: z.object({ orderId: id }),
      run: async ({ orderId }) => {
        const db = createAdminClient();
        const { data: order } = await db
          .from("orders")
          .select(
            "id, order_no, client_name, client_phone, order_type, delivery_date, deadline_at, approval_status, released_at, cancelled_at, cancel_reason, quoted_price, agent_name, designer_name, items:order_items (id, product, product_type, qty, attributes, production_status, list_unit_price, line_discount_kind, line_discount_value, worker:workers (name))",
          )
          .eq("id", orderId)
          .maybeSingle();
        if (!order) return "That order doesn't exist.";
        const invoice = await getInvoiceForOrder(orderId);
        const inv = invoice.ok ? invoice.data : null;
        const draft = inv ? null : await getInvoiceDraft(orderId);
        return {
          ...order,
          stage: order.cancelled_at ? "cancelled" : stage(order),
          invoice: inv ? { number: inv.invoiceNo, amount: inv.amount, discount: inv.discount, paid: inv.paid, balance: inv.balance, due: inv.dueDate, status: inv.status, link: inv.shareUrl } : null,
          invoiceWouldBe: draft?.ok ? draft.data.lines.map((l) => ({ itemId: l.itemId, line: l.title, qty: l.qty, unitPrice: l.unitPrice, discount: l.agreedDiscount })) : null,
        };
      },
    }),
    readTool({
      name: "team",
      description: "The factory workers (with their station) and graphics designers, with their ids and whether they're active: for assigning an item or sending an order to a designer.",
      inputSchema: z.object({}),
      run: async () => {
        const db = createAdminClient();
        const [{ data: workers }, { data: designers }] = await Promise.all([
          db.from("workers").select("id, name, station, active").order("name"),
          db.from("designers").select("id, name, active").order("name"),
        ]);
        return { workers, designers };
      },
    }),
  ];
  const change: ChangeTool[] = [
    changeTool({
      name: "assign_item",
      description: "Give an order item to a factory worker (id from team), or take it off whoever has it (workerId null).",
      inputSchema: z.object({ itemId: id, workerId: id.nullable() }),
      card: async ({ itemId, workerId }) => {
        const item = await itemFor(itemId);
        const db = createAdminClient();
        const name = async (w: string | null) => (w ? ((await db.from("workers").select("name").eq("id", w).maybeSingle()).data?.name ?? null) : null);
        const [now, next] = await Promise.all([name(item.assigned_worker_id), name(workerId)]);
        if (workerId && !next) throw new Error("That worker doesn't exist. Look them up with team.");
        return { title: `Order ${item.order.order_no}: ${next ? `give ${itemName(item)} to ${next}` : `take ${itemName(item)} off ${now ?? "its worker"}`}`, lines: [`Client: ${item.order.client_name ?? "unknown"}`, `Now: ${now ?? "nobody"}`] };
      },
      run: async ({ itemId, workerId }) => outcome(await assignItem(itemId, workerId), workerId ? "The item is assigned." : "The item has no worker now."),
    }),
    changeTool({
      name: "edit_order_item",
      description:
        "Change an item's quantity or details (e.g. Sheets, Size, Cover Type: the names from order_details), and the order's delivery date (and deadline for express orders). Give only what changes. Not for delivered items.",
      inputSchema: z.object({
        itemId: id,
        qty: z.number().int().positive().nullable(),
        details: z.record(z.string(), z.string()).nullable().describe("Only the details that change, by their names."),
        deliveryDate: day.nullable(),
        deadline: z.string().nullable().describe("Express orders: date and time, YYYY-MM-DDTHH:MM."),
      }),
      card: async (e) => {
        const item = await itemFor(e.itemId);
        const lines = [
          ...(e.qty && e.qty !== item.qty ? [`Quantity: ${item.qty} → ${e.qty}`] : []),
          ...Object.entries(e.details ?? {}).map(([k, v]) => `${k}: ${item.attributes?.[k] ?? "none"} → ${v}`),
          ...(e.deliveryDate && e.deliveryDate !== item.order.delivery_date ? [`Delivery date: ${item.order.delivery_date ?? "none"} → ${e.deliveryDate}`] : []),
          ...(e.deadline ? [`Deadline: ${e.deadline}`] : []),
        ];
        if (!lines.length) throw new Error("Nothing changes: say what should be different.");
        return { title: `Order ${item.order.order_no}: change ${itemName(item)}`, lines: [`Client: ${item.order.client_name ?? "unknown"}`, ...lines] };
      },
      run: async (e) => {
        const item = await itemFor(e.itemId);
        const deliveryDate = e.deliveryDate ?? item.order.delivery_date;
        if (!deliveryDate) return { ok: false, error: "The order needs a delivery date." };
        return outcome(
          await updateOrderItem({
            itemId: item.id,
            category_id: item.category_id,
            product_id: item.product_id,
            variant_id: item.variant_id ?? "",
            qty: e.qty ?? item.qty,
            attributes: { ...(item.attributes ?? {}), ...(e.details ?? {}) },
            delivery_date: deliveryDate,
            deadline_at: e.deadline ?? item.order.deadline_at ?? "",
          }),
          "The item is changed.",
        );
      },
    }),
    changeTool({
      name: "rename_client_on_order",
      description: "Fix the client's name on an order (it's fixed on the client's record too).",
      inputSchema: z.object({ orderId: id, name: z.string().trim().min(1).max(100) }),
      card: async ({ orderId, name }) => {
        const o = await orderFor(orderId);
        return { title: `Order ${o.order_no}: rename the client to ${name}`, lines: [`Now: ${o.client_name ?? "no name"}`, "Their client record gets the new name too"] };
      },
      run: async ({ orderId, name }) => outcome(await renameClientOnOrder(orderId, name), `The client is now ${name}.`),
    }),
    changeTool({
      name: "set_agreed_price",
      description: "The price per unit agreed with the client for an item with no catalog price (photo books), before the order is confirmed. In UGX.",
      inputSchema: z.object({ itemId: id, unitPrice: z.number().int().positive() }),
      card: async ({ itemId, unitPrice }) => {
        const item = await itemFor(itemId);
        return { title: `Order ${item.order.order_no}: ${itemName(item)} at ${ugx(unitPrice)} each`, lines: [`Quantity: ${item.qty}, line total ${ugx(unitPrice * item.qty)}`, `Now: ${item.list_unit_price == null ? "no price" : ugx(item.list_unit_price)}`] };
      },
      run: async ({ itemId, unitPrice }) => outcome(await setAgreedUnitPrice(itemId, unitPrice), "The price is agreed."),
    }),
    changeTool({
      name: "set_item_discount",
      description: "Give, change or remove (discount null) a discount on one item: a percent, or UGX off each unit. New discounts only before the order is confirmed; agent orders take none.",
      inputSchema: z.object({ itemId: id, discount: z.object({ kind: z.enum(["percent", "amount"]), value: z.number().positive() }).nullable() }),
      card: async ({ itemId, discount }) => {
        const item = await itemFor(itemId);
        return {
          title: `Order ${item.order.order_no}: ${discount ? `${discount.kind === "percent" ? `${discount.value}%` : `${ugx(discount.value)} each`} off ${itemName(item)}` : `remove the discount on ${itemName(item)}`}`,
          lines: [`Client: ${item.order.client_name ?? "unknown"}`, `Quantity: ${item.qty}`],
        };
      },
      run: async ({ itemId, discount }) => outcome(await setLineDiscount(itemId, discount), discount ? "The discount is on." : "The discount is removed."),
    }),
    changeTool({
      name: "set_order_amount",
      description: "Set what a confirmed order that has no invoice yet costs the client in total, in UGX, or null to go back to the catalog prices.",
      inputSchema: z.object({ orderId: id, amount: z.number().int().positive().nullable() }),
      card: async ({ orderId, amount }) => {
        const o = await orderFor(orderId);
        return { title: `Order ${o.order_no}: ${amount ? `total ${ugx(amount)}` : "back to catalog prices"}`, lines: [`Client: ${o.client_name ?? "unknown"}`, `Now: ${o.quoted_price == null ? "catalog prices" : ugx(o.quoted_price)}`] };
      },
      run: async ({ orderId, amount }) => outcome(await setOrderAmount(orderId, amount), "The order's amount is set."),
    }),
    changeTool({
      name: "confirm_order",
      description: "Confirm (receive) an order that's waiting for review: the client gets the confirmation in their chat. Optionally with its total in UGX. Then it needs an invoice and to be sent to production.",
      inputSchema: z.object({ orderId: id, total: z.number().int().positive().nullable() }),
      card: async ({ orderId, total }) => {
        const o = await orderFor(orderId);
        if (o.released_at) throw new Error(`Order ${o.order_no} is already in production.`);
        return { title: `Confirm order ${o.order_no}`, lines: [`Client: ${o.client_name ?? "unknown"}`, ...(total ? [`Total: ${ugx(total)}`] : []), "The client is told"] };
      },
      run: async ({ orderId, total }) => outcome(await receiveClientOrder(orderId, total ?? undefined), "The order is confirmed."),
    }),
    changeTool({
      name: "generate_invoice",
      description:
        "Issue a confirmed order's invoice with the line prices from order_details (invoiceWouldBe). Lines without a price need one in prices (UGX per unit, by item id); prices can also change a line's price. The client can then pay it.",
      inputSchema: z.object({ orderId: id, prices: z.array(z.object({ itemId: id, unitPrice: z.number().int().positive() })).nullable(), dueDate: day.nullable(), notes: z.string().max(500).nullable() }),
      card: async ({ orderId, prices, dueDate }) => {
        const o = await orderFor(orderId);
        const draft = await getInvoiceDraft(orderId);
        if (!draft.ok) throw new Error(draft.error);
        const lines = draft.data.lines.map((l) => ({ ...l, unitPrice: prices?.find((p) => p.itemId === l.itemId)?.unitPrice ?? l.unitPrice }));
        const missing = lines.filter((l) => l.unitPrice == null);
        if (missing.length) throw new Error(`These lines need a price first: ${missing.map((l) => l.title).join(", ")}.`);
        const total = lines.reduce((s, l) => s + (l.unitPrice ?? 0) * l.qty, 0);
        return { title: `Invoice for order ${o.order_no}: ${ugx(total)}`, lines: [`Client: ${o.client_name ?? "unknown"}`, ...lines.map((l) => `${l.title}: ${l.qty} × ${ugx(l.unitPrice ?? 0)}`), ...(dueDate ? [`Due: ${dueDate}`] : [])] };
      },
      run: async ({ orderId, prices, dueDate, notes }) => {
        const draft = await getInvoiceDraft(orderId);
        if (!draft.ok) return draft;
        const lines = draft.data.lines.map((l) => ({ itemId: l.itemId, unit: l.unit, unitPrice: prices?.find((p) => p.itemId === l.itemId)?.unitPrice ?? l.unitPrice ?? 0 }));
        const res = await generateInvoice(orderId, { lines, dueDate, notes, currency: draft.data.currency });
        return res.ok ? { ok: true, done: `Invoice ${res.data.invoiceNo} is issued: ${ugx(res.data.amount)}.` } : res;
      },
    }),
    changeTool({
      name: "send_to_production",
      description: "Send a confirmed, invoiced order on: to the factory, or to a graphics designer first (designerId from team). Agent orders need their pay-first share paid.",
      inputSchema: z.object({ orderId: id, to: z.enum(["factory", "designer"]), designerId: id.nullable() }),
      card: async ({ orderId, to, designerId }) => {
        const o = await orderFor(orderId);
        if (o.released_at) throw new Error(`Order ${o.order_no} is already in production.`);
        const designer = designerId ? (await createAdminClient().from("designers").select("name").eq("id", designerId).maybeSingle()).data?.name : null;
        if (to === "designer" && !designer) throw new Error("Say which designer: look them up with team.");
        return { title: `Send order ${o.order_no} to ${to === "factory" ? "the factory" : designer}`, lines: [`Client: ${o.client_name ?? "unknown"}`, ...(o.delivery_date ? [`Delivery: ${o.delivery_date}`] : [])] };
      },
      run: async ({ orderId, to, designerId }) => outcome(await routeApprovedOrder(orderId, to, designerId ?? undefined), "The order is in production."),
    }),
  ];
  if (!can(v.access, "orders", "manage")) change.length = 0;
  if (can(v.access, "order_admin", "manage")) {
    change.push(
      changeTool({
        name: "cancel_order",
        description: "Cancel an order that isn't completed, with the reason. The client, designer and workers are told the reason.",
        inputSchema: z.object({ orderId: id, reason: z.string().trim().min(3).max(300) }),
        card: async ({ orderId, reason }) => {
          const o = await orderFor(orderId);
          return { title: `Cancel order ${o.order_no}`, lines: [`Client: ${o.client_name ?? "unknown"}`, `Now: ${stage(o)}`, `Reason: ${reason}`, "The client and the team are told"] };
        },
        run: async ({ orderId, reason }) => outcome(await cancelOrder(orderId, reason), "The order is cancelled."),
      }),
    );
  }
  return { read, change };
}

/** Workers on the factory board: their own items. */
function workerChanges(): ChangeTool[] {
  return [
    changeTool({
      name: "move_item_on",
      description: "Move one of the worker's items to its next production step (as the button on the board does). Use the item id from factory_board.",
      inputSchema: z.object({ itemId: id }),
      card: async ({ itemId }) => {
        const item = await itemFor(itemId);
        return { title: `Order ${item.order.order_no}: move ${itemName(item)} on`, lines: [`Now: ${STATUS_LABELS[item.production_status]}`] };
      },
      run: async ({ itemId }) => outcome(await advanceStatus(itemId), "The item has moved on."),
    }),
    changeTool({
      name: "flag_delay",
      description: "Say an item is delayed, with the reason. The office is told.",
      inputSchema: z.object({ itemId: id, reason: z.string().trim().min(3).max(300) }),
      card: async ({ itemId, reason }) => {
        const item = await itemFor(itemId);
        return { title: `Order ${item.order.order_no}: ${itemName(item)} is delayed`, lines: [`Reason: ${reason}`] };
      },
      run: async ({ itemId, reason }) => outcome(await flagDelay(itemId, reason), "The delay is flagged."),
    }),
    changeTool({
      name: "clear_delay",
      description: "The delay on an item is over.",
      inputSchema: z.object({ itemId: id }),
      card: async ({ itemId }) => {
        const item = await itemFor(itemId);
        return { title: `Order ${item.order.order_no}: ${itemName(item)} is no longer delayed`, lines: [] };
      },
      run: async ({ itemId }) => outcome(await clearDelay(itemId), "The delay is cleared."),
    }),
  ];
}

/** Designers: their own orders. */
function designerChanges(): ChangeTool[] {
  return [
    changeTool({
      name: "send_item_to_factory",
      description: "One finished item goes on to the factory while the rest of the order stays with the designer. Item id from my_design_orders.",
      inputSchema: z.object({ itemId: id }),
      card: async ({ itemId }) => {
        const item = await itemFor(itemId);
        return { title: `Order ${item.order.order_no}: send ${itemName(item)} to the factory`, lines: [`Client: ${item.order.client_name ?? "unknown"}`] };
      },
      run: async ({ itemId }) => outcome(await advanceItemToFactory(itemId), "The item is with the factory."),
    }),
    changeTool({
      name: "finish_design",
      description: "The designer's work on a whole order is done: everything left goes to the factory. Order id from my_design_orders.",
      inputSchema: z.object({ orderId: id }),
      card: async ({ orderId }) => {
        const o = await orderFor(orderId);
        return { title: `Order ${o.order_no}: design done, send it to the factory`, lines: [`Client: ${o.client_name ?? "unknown"}`] };
      },
      run: async ({ orderId }) => outcome(await completeDesignerWork(orderId), "The order is with the factory."),
    }),
  ];
}

export const ordersAlexis = { managerTools, workerChanges, designerChanges };
