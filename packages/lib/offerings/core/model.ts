// The offerings module's records. Pure; safe on client and server.
//
// What a business sells, managed the way Aming manages products: categories
// ("Weddings", "Portraits") holding services ("Wedding Photography"), each
// with packages as its tiers ("Gold", "Silver", "Bronze", "Custom"), every
// package with its own price, description and what's included. Products
// (photobooks, frames) are kept the same way: categories of their own
// ("Photobooks"), each product with its sizes as its packages. Every
// category, service, product and package belongs to one tenant.

/** What a category holds: services (booked) or products (ordered). */
export type OfferingKind = "service" | "product";

/** A group of services or of products: a row in the showroom. */
export interface Category {
  id: string;
  kind: OfferingKind;
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

/**
 * A service, or a product (`kind`, always its category's). A product is the
 * studio's own, or picked from Aming's catalog (`sourceProductId`): then its
 * name, photos, video and sizes are Aming's, and the studio sets its prices
 * and description and may leave some of Aming's photos out.
 */
export interface Service extends ServiceInput {
  id: string;
  kind: OfferingKind;
  categoryId: string;
  /** Its page's address under the business's: /<studio>/s/<slug> (a product: /p/<slug>). Never changes. */
  slug: string;
  /** The Aming product it was picked from, or null for the business's own. */
  sourceProductId: string | null;
  /** Of a picked product: Aming's photos and videos it leaves out (see AMING_COVER, AMING_VIDEO). */
  hiddenMedia: string[];
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

/** A package: one tier of a service, or one size of a product. Quotations, invoices and bookings are built from these. */
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

/** What picking an Aming product copies: its name and description, and its sizes' names (none: one size, named after it). */
export interface AmingPick {
  productId: string;
  name: string;
  description: string | null;
  sizes: string[];
}

/** What saving led to: saved, or another one on sale already has that name. */
export type SaveOutcome<T> = { saved: T } | { duplicateOf: T };
