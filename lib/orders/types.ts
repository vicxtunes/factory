import type { OrderType } from "@/lib/types";
import type { ClientMatchReason } from "@/lib/clients/match";

// Shared order-creation types. No server-only imports — both the shared
// client form (components/order/OrderForm.tsx) and the server actions that
// back it (dashboard createOrder, graphics createDesignerOrder) use these.

export type OrderRoute = "factory" | "designer";

export interface OrderItemInput {
  category_id: string;
  product_id: string;
  variant_id: string; // "" when the product has no variant selected
  qty: number;
  attributes: Record<string, string>;
  item_notes: string;
}

export interface OrderFormPayload {
  customerType: "new" | "existing";
  client_id: string; // used when customerType === "existing"
  new_client: { name: string; email: string; phone: string }; // used when "new"
  agent_id: string;
  responsible_worker_id: string; // required — initial owner, written to every item
  order_type: OrderType;
  delivery_date: string;
  deadline_at: string; // datetime-local value, required only when express
  order_notes: string;
  items: OrderItemInput[];
  route: OrderRoute;
  // manager variant: the chosen designer when route === "designer".
  // designer variant: always "" — the server fills it from the PIN session.
  designer_id: string;
  designer_brief: string;
}

export type CreateOrderResult =
  | {
      ok: true;
      orderNo: string;
      items: { formIndex: number; itemId: string }[];
      warnings: string[];
    }
  | { ok: false; error: string };

export interface ClientDuplicateHit {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  reason: ClientMatchReason;
}
