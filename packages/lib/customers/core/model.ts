// The customers module's records. Pure; safe on client and server.
//
// A customer is someone a business (a tenant: today, a client's studio)
// works for: the people it photographs, quotes and invoices. Every customer
// belongs to exactly one tenant.

/** What the business fills in about a customer. */
export interface CustomerInput {
  name: string;
  /** One stored form per number (packages/lib/kernel/core/phone.ts). */
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface Customer extends CustomerInput {
  id: string;
  /** Archived customers are hidden from everyday lists but keep their history. */
  archivedAt: string | null;
  createdAt: string;
}

/** What saving a customer led to: saved, or another customer already has that phone number. */
export type SaveOutcome = { saved: Customer } | { duplicateOf: Customer };
