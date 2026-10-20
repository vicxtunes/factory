// What vendors charge for their services, and what a job at a rate costs. Pure.

/** What a rate is counted in: a price per photo, per day, or for the whole project. */
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

/** One service at its price: "Colour & retouch, UGX 5,000 per photo". */
export interface VendorRate {
  service: string;
  /** UGX, whole shillings. */
  price: number;
  unit: RateUnit;
}

export const rateUnit = (id: RateUnit) => RATE_UNITS.find((u) => u.id === id)!;

/** "UGX 5,000 per photo". */
export const ratePrice = (rate: VendorRate) => `UGX ${rate.price.toLocaleString("en-US")} ${rateUnit(rate.unit).label}`;

/** A job of `quantity` at the rate: what it costs ("project" counts once). */
export const rateTotal = (rate: VendorRate, quantity: number) => rate.price * (rate.unit === "project" ? 1 : quantity);
