// The offerings module's records. Pure; safe on client and server.
//
// What a business sells: services ("Wedding Photography"), each with
// packages as its tiers ("Gold", "Silver", "Bronze", "Custom"), every
// package with its own price, description and what's included. Every
// service and package belongs to one tenant.

/** What the business fills in for a service. */
export interface ServiceInput {
  name: string;
  description: string | null;
}

export interface Service extends ServiceInput {
  id: string;
  /** Its page's address under the business's: /<studio>/s/<slug>. Never changes. */
  slug: string;
  /** The showroom's order, smallest first. */
  position: number;
  /** Archived services (and their packages) are off sale but kept for what already used them. */
  archivedAt: string | null;
  createdAt: string;
}

/** What the business fills in for a package. */
export interface OfferingInput {
  name: string;
  description: string | null;
  /** Whole units of the tenant's currency. */
  price: number;
  /** What it includes, one short line each. */
  inclusions: string[];
}

/** A package: one tier of a service. Quotations, invoices and bookings are built from these. */
export interface Offering extends OfferingInput {
  id: string;
  serviceId: string;
  serviceName: string;
  /** Its order within the service, smallest first. */
  position: number;
  /** Archived packages are off sale but kept for what already used them. */
  archivedAt: string | null;
  createdAt: string;
}

/** The service form: the service and its packages on sale, saved together. A package without an id is new. */
export interface ServiceFormInput extends ServiceInput {
  packages: (OfferingInput & { id?: string })[];
}

/** A service with its packages. */
export interface ServiceWithPackages extends Service {
  packages: Offering[];
}

/** What saving led to: saved, or another one on sale already has that name. */
export type SaveOutcome<T> = { saved: T } | { duplicateOf: T };
export type ServiceSaveOutcome = SaveOutcome<Service>;
