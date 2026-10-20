// A vendor's services: what each is, what it costs, and samples of their
// work. Pure.

/** What a price is counted in: per photo, per day, or for the whole project. */
export const RATE_UNITS = [
  { id: "photo", label: "per photo", many: "photos" },
  { id: "video", label: "per video", many: "videos" },
  { id: "hour", label: "per hour", many: "hours" },
  { id: "day", label: "per day", many: "days" },
  { id: "event", label: "per event", many: "events" },
  { id: "item", label: "per item", many: "items" },
  { id: "project", label: "per project", many: "projects" },
] as const;

export type RateUnit = (typeof RATE_UNITS)[number]["id"];

/** A picture of their work for a service, in the photo bucket. */
export interface ServiceSample {
  id: string;
  key: string;
}

/** One service a vendor offers: "Colour & retouch, UGX 5,000 per photo", with samples. */
export interface VendorOffer {
  id: string;
  name: string;
  description: string | null;
  /** UGX per unit; both null: the price is agreed on request. */
  price: number | null;
  unit: RateUnit | null;
  /** The oldest first. */
  samples: ServiceSample[];
}

/** A service as the vendor writes it (offerSchema's output). */
export type OfferInput = Pick<VendorOffer, "name" | "description" | "price" | "unit">;

/** A service's samples, at most. */
export const SAMPLES_PER_SERVICE = 12;

/** A sample's longest side, in pixels, as uploaded. */
export const SAMPLE_EDGE = 1600;

export const rateUnit = (id: RateUnit) => RATE_UNITS.find((u) => u.id === id)!;

/** "UGX 5,000 per photo", or "Price on request". */
export const offerPrice = (offer: Pick<VendorOffer, "price" | "unit">) =>
  offer.price === null || offer.unit === null ? "Price on request" : `UGX ${offer.price.toLocaleString("en-US")} ${rateUnit(offer.unit).label}`;

/** A job of `quantity` at a priced service: what it costs ("project" counts once). */
export const offerTotal = (offer: { price: number; unit: RateUnit }, quantity: number) => offer.price * (offer.unit === "project" ? 1 : quantity);
