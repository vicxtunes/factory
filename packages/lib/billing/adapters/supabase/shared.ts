import "server-only";

// What the billing adapters share: line rows, the save functions' line JSON,
// shoots, and turning the database's BILLING:<code> errors into sentences.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { LineInput, Shoot } from "../../core/model";
import { BillingError } from "../../ports";

export interface LineRow {
  position: number;
  offering_id: string | null;
  description: string;
  inclusions: string[];
  quantity: number;
  unit_price: number | string;
  discount_kind: "percent" | "amount" | null;
  discount_value: number | string | null;
}

export const LINES = "lines:billing_lines (position, offering_id, description, inclusions, quantity, unit_price, discount_kind, discount_value)";

/** Lines in order. bigints may arrive as strings. */
export const toLines = (rows: LineRow[]): LineInput[] =>
  [...rows]
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      offeringId: l.offering_id,
      description: l.description,
      inclusions: l.inclusions,
      quantity: l.quantity,
      unitPrice: Number(l.unit_price),
      discount: l.discount_kind && l.discount_value != null ? { kind: l.discount_kind, value: Number(l.discount_value) } : null,
    }));

/** The line fields the save functions read, named one by one. */
export const toLineJson = (l: LineInput) => ({
  offeringId: l.offeringId,
  description: l.description,
  inclusions: l.inclusions,
  quantity: l.quantity,
  unitPrice: l.unitPrice,
  discount: l.discount ? { kind: l.discount.kind, value: l.discount.value } : null,
});

const ERRORS: Record<string, string> = {
  "BILLING:customer_not_found": "That client no longer exists.",
  "BILLING:not_editable": "This document can't be changed any more.",
  "BILLING:source_not_accepted": "Only an accepted quotation can become an invoice.",
  "BILLING:invoice_not_found": "That invoice no longer exists.",
  "BILLING:invoice_void": "This invoice is void.",
  "BILLING:overpaid": "That's more than what's left to pay on this invoice.",
  "BILLING:has_payments": "This invoice has payments. Void them first.",
};

/** A known BILLING:<code> becomes a BillingError the person sees; anything else is a bug. */
export function fail(what: string, error: { message: string; code?: string }): never {
  const known = Object.keys(ERRORS).find((code) => error.message.includes(code));
  if (known) throw new BillingError(ERRORS[known]);
  // The one-invoice-per-quotation index: made twice at once.
  if (error.code === "23505" && error.message.includes("one_invoice_per_quotation")) {
    throw new BillingError("This quotation already has an invoice.");
  }
  throw new Error(`billing: could not ${what}: ${error.message}`);
}

/** The shoot columns, as read. Postgres gives times as "14:00:00"; the app speaks "14:00". */
export const SHOOT = "shoot_date, shoot_start, shoot_end";
export interface ShootRow {
  shoot_date: string | null;
  shoot_start: string | null;
  shoot_end: string | null;
}
export const toShoot = (r: ShootRow): Shoot | null =>
  r.shoot_date ? { date: r.shoot_date, startTime: r.shoot_start?.slice(0, 5) ?? null, endTime: r.shoot_end?.slice(0, 5) ?? null } : null;

/**
 * Saves a document's shoot, right after its save function wrote the rest
 * (that function predates shoots). `what` names it for the error.
 */
export async function saveShoot(tenantId: string, id: string, shoot: Shoot | null, what: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("billing_documents")
    .update({ shoot_date: shoot?.date ?? null, shoot_start: shoot?.startTime ?? null, shoot_end: shoot?.endTime ?? null })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) fail(`save the ${what}'s shoot`, error);
}
