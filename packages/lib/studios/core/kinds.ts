// The kinds of business on Aming, and what vendors do. Pure.
//
// A business is a photography studio or a vendor. A vendor has a category:
// photo editors and videographers first (Aming's focus), then event, beauty
// and transport vendors. The list lives here, not in the database, so a new
// category is one line here.

export type BusinessKind = "studio" | "vendor";

export interface VendorCategory {
  id: string;
  label: string;
  /** Who it's for, in a few words (set-up and the marketplace). */
  hint: string;
  group: VendorGroup;
}

export type VendorGroup = "photo" | "decor" | "food" | "entertainment" | "beauty";

export const VENDOR_GROUPS: Record<VendorGroup, string> = {
  photo: "Photo & video",
  decor: "Decor & venues",
  food: "Food & drink",
  entertainment: "Entertainment",
  beauty: "Beauty, fashion & transport",
};

/** Every vendor category, the ones Aming focuses on first. */
export const VENDOR_CATEGORIES: VendorCategory[] = [
  { id: "photo_editor", label: "Photo editor", hint: "Edits and retouches photographers' shoots", group: "photo" },
  { id: "videographer", label: "Videographer", hint: "Films and edits events and stories", group: "photo" },
  { id: "decor", label: "Decor", hint: "Event decoration and styling", group: "decor" },
  { id: "venue", label: "Venue", hint: "Halls, gardens and spaces for events", group: "decor" },
  { id: "tents_chairs", label: "Tents & chairs", hint: "Tents, chairs, tables and covers for hire", group: "decor" },
  { id: "florist", label: "Florist", hint: "Flowers and bouquets", group: "decor" },
  { id: "lighting", label: "Lighting", hint: "Event and stage lighting", group: "decor" },
  { id: "catering", label: "Catering", hint: "Food for events", group: "food" },
  { id: "cakes", label: "Cakes", hint: "Wedding, birthday and event cakes", group: "food" },
  { id: "drinks", label: "Drinks & bar", hint: "Drinks and bar service", group: "food" },
  { id: "sound_dj", label: "Sound & DJ", hint: "PA systems and DJs", group: "entertainment" },
  { id: "mc", label: "MC", hint: "Masters of ceremony", group: "entertainment" },
  { id: "band", label: "Band", hint: "Live music", group: "entertainment" },
  { id: "dancers", label: "Dancers", hint: "Dance groups and performers", group: "entertainment" },
  { id: "makeup_hair", label: "Makeup & hair", hint: "Bridal and event makeup and hair", group: "beauty" },
  { id: "bridal_wear", label: "Bridal wear", hint: "Gowns, suits and outfits", group: "beauty" },
  { id: "car_hire", label: "Car hire", hint: "Wedding and event cars", group: "beauty" },
];

/** The categories Aming focuses on now: shown first, and marked so. */
export const FEATURED_VENDOR_CATEGORIES = ["photo_editor", "videographer"];

export const vendorCategory = (id: string | null | undefined): VendorCategory | null => VENDOR_CATEGORIES.find((c) => c.id === id) ?? null;

/** What a business is, in a few words: "Photography studio", "Videographer". */
export function businessKindLabel(kind: BusinessKind, category: string | null): string {
  if (kind === "studio") return "Photography studio";
  return vendorCategory(category)?.label ?? "Vendor";
}

/** Aming's fee, in percent of a business's customer payments (the database's business_fee_percent). */
export const FEE_PERCENT: Record<BusinessKind, number> = { studio: 5, vendor: 10 };
