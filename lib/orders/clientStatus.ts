import type { OrderStage, ProductionStatus } from "@/lib/types";

// Client-facing status vocabulary — distinct from the internal
// production_status enum. A client order sits in "pending" (nobody has
// triaged it yet — see lib/orders/create.ts's "land unassigned for staff to
// triage" comment) until staff assign it, at which point it becomes
// "received" and then follows whichever route (designer or straight to
// factory) staff put it on. Staff-created orders are always assigned at
// creation, so they skip "pending" entirely.
export type ClientStatus =
  | "pending"
  | "received"
  | "in_designing"
  | "production"
  | "quality_check"
  | "ready_for_delivery"
  | "delivered";

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  pending: "Pending",
  received: "Received",
  in_designing: "In Designing",
  production: "Production",
  quality_check: "Quality Check",
  ready_for_delivery: "Ready for delivery",
  delivered: "Delivered",
};

// Which internal production_status hue (components/ui/statusColors.ts,
// StatusGlowBadge) a client status borrows its color from, so client and
// staff views still read as the same "how far along" color language.
const COLOR_KEY: Record<ClientStatus, ProductionStatus> = {
  pending: "not_started",
  received: "not_started",
  in_designing: "in_production",
  production: "in_production",
  quality_check: "quality_check",
  ready_for_delivery: "ready_for_pickup",
  delivered: "completed",
};

export function clientStatusColorKey(status: ClientStatus): ProductionStatus {
  return COLOR_KEY[status];
}

export function clientStatus(item: {
  production_status: ProductionStatus;
  stage: OrderStage;
  assigned_worker_id: string | null;
}): ClientStatus {
  if (item.stage === "with_designer") return "in_designing";
  if (item.production_status === "not_started") {
    return item.assigned_worker_id ? "received" : "pending";
  }
  if (item.production_status === "in_production") return "production";
  if (item.production_status === "quality_check") return "quality_check";
  if (item.production_status === "ready_for_pickup") return "ready_for_delivery";
  return "delivered";
}

// Ordered steps for the client progress tracker. The second step is keyed
// off the item's current stage rather than history — an item that finished
// designing and moved to the factory reads as a "production" item from then
// on, same as one that skipped the designer entirely.
export function clientStatusSteps(stage: OrderStage): ClientStatus[] {
  return [
    "pending",
    "received",
    stage === "with_designer" ? "in_designing" : "production",
    "quality_check",
    "ready_for_delivery",
    "delivered",
  ];
}
