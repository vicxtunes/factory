// The offerings module's records. Pure; safe on client and server.
//
// An offering is something a business sells: a package (a bundle, with what
// it includes) or a single service. Every offering belongs to one tenant.

export type OfferingKind = "package" | "service";

/** What the business fills in. */
export interface OfferingInput {
  kind: OfferingKind;
  name: string;
  description: string | null;
  /** Whole units of the tenant's currency. */
  price: number;
  /** What it includes, one short line each. */
  inclusions: string[];
}

export interface Offering extends OfferingInput {
  id: string;
  /** Archived offerings are off sale but kept for what already used them. */
  archivedAt: string | null;
  createdAt: string;
}

/** What saving led to: saved, or another active offering already has that name. */
export type OfferingSaveOutcome = { saved: Offering } | { duplicateOf: Offering };

export const OFFERING_KIND_LABELS: Record<OfferingKind, string> = { package: "Package", service: "Service" };
