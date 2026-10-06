// The offerings module's records. Pure; safe on client and server.
//
// What a business sells, managed the way Aming manages products: categories
// ("Weddings", "Portraits") holding services ("Wedding Photography"), each
// with packages as its tiers ("Gold", "Silver", "Bronze", "Custom"), every
// package with its own price, description and what's included. Every
// category, service and package belongs to one tenant.

/** A group of services: a row in the showroom. */
export interface Category {
  id: string;
  name: string;
  /** The showroom's order, smallest first. */
  position: number;
  /** Deactivated categories (and their services) are off sale but kept. */
  archivedAt: string | null;
  createdAt: string;
}

/** Whether the showroom shows package prices, and how a service's page shows its photos. */
export interface ShowroomSettings {
  showPrices: boolean;
  viewMode: "scene" | "carousel";
}

export const DEFAULT_SHOWROOM_SETTINGS: ShowroomSettings = { showPrices: true, viewMode: "scene" };

/** What the business fills in for a service. */
export interface ServiceInput {
  name: string;
  description: string | null;
}

export interface Service extends ServiceInput {
  id: string;
  categoryId: string;
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

/** A service with its packages. */
export interface ServiceWithPackages extends Service {
  packages: Offering[];
}

/** A category with its services (each with its packages). */
export interface CategoryWithServices extends Category {
  services: ServiceWithPackages[];
}

/** What saving led to: saved, or another one on sale already has that name. */
export type SaveOutcome<T> = { saved: T } | { duplicateOf: T };
