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
  photo: "Photo, video & design",
  decor: "Decor & venues",
  food: "Food & drink",
  entertainment: "Entertainment",
  beauty: "Beauty, fashion & transport",
};

/** Every vendor category, the ones Aming focuses on first. */
export const VENDOR_CATEGORIES: VendorCategory[] = [
  { id: "photo_editor", label: "Photo editor", hint: "Edits and retouches photographers' shoots", group: "photo" },
  { id: "videographer", label: "Videographer", hint: "Films and edits events and stories", group: "photo" },
  { id: "photographer", label: "Photographer", hint: "Shoots for clients, or for studios as a second shooter", group: "photo" },
  { id: "graphic_designer", label: "Graphic designer", hint: "Branding, invitations, album covers and posters", group: "photo" },
  { id: "equipment_hire", label: "Equipment hire", hint: "Cameras, lenses, lights and drones for hire", group: "photo" },
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

/** What each kind of vendor offers, to pick from at sign-up (they can add their own). */
export const VENDOR_SKILLS: Record<string, string[]> = {
  photo_editor: ["Colour correction", "Skin retouching", "Culling", "Background removal", "Album design", "Photo restoration", "Composites", "Batch editing"],
  videographer: ["Wedding films", "Highlight reels", "Event coverage", "Music videos", "Drone", "Livestreaming", "Video editing", "Corporate & ads"],
  photographer: ["Weddings", "Portraits", "Events", "Products", "Fashion", "Corporate", "Second shooter", "Drone"],
  graphic_designer: ["Logos & branding", "Invitations", "Album covers", "Posters & flyers", "Social media graphics", "Photo book layout"],
  equipment_hire: ["Cameras", "Lenses", "Lighting", "Drones", "Gimbals", "Backdrops", "Studio space"],
  decor: ["Weddings", "Introductions", "Birthdays", "Corporate events", "Backdrops", "Table styling"],
  venue: ["Indoor hall", "Garden", "Rooftop", "Beach", "Conference room"],
  tents_chairs: ["Tents", "Chairs", "Tables", "Covers & linen", "Set-up crew"],
  florist: ["Bridal bouquets", "Table arrangements", "Venue flowers", "Car decoration"],
  lighting: ["Stage lighting", "Uplighting", "Fairy lights", "Generators"],
  catering: ["Buffet", "Plated", "Local dishes", "Continental", "Snacks & bites"],
  cakes: ["Wedding cakes", "Birthday cakes", "Cupcakes", "Dessert tables"],
  drinks: ["Mobile bar", "Cocktails", "Soft drinks", "Bar staff"],
  sound_dj: ["DJ", "PA system", "Microphones", "Live mixing"],
  mc: ["Weddings", "Introductions", "Corporate", "Bilingual"],
  band: ["Live band", "Traditional music", "Gospel", "Acoustic"],
  dancers: ["Traditional dance", "Modern dance", "Choreography"],
  makeup_hair: ["Bridal makeup", "Event makeup", "Hair styling", "Nails"],
  bridal_wear: ["Gowns", "Suits", "Traditional wear", "Bridesmaids", "Alterations"],
  car_hire: ["Bridal car", "Convoy", "Chauffeur", "Vintage cars"],
};

/** Where a vendor shows their work, in the order sign-up asks. */
export const SOCIAL_NETWORKS = [
  { id: "instagram", label: "Instagram", prefix: "instagram.com/" },
  { id: "tiktok", label: "TikTok", prefix: "tiktok.com/@" },
  { id: "facebook", label: "Facebook", prefix: "facebook.com/" },
  { id: "youtube", label: "YouTube", prefix: "youtube.com/@" },
  { id: "x", label: "X", prefix: "x.com/" },
  { id: "website", label: "Website", prefix: "" },
] as const;

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]["id"];

/**
 * A handle as typed ("@kato.films", "https://instagram.com/kato.films/")
 * made plain ("kato.films"); a website kept whole, without its scheme. Empty
 * for nothing usable.
 */
export function socialHandle(network: SocialNetwork, input: string): string {
  const raw = input.trim();
  if (network === "website") return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const path = raw.replace(/^https?:\/\//i, "").replace(/^(www\.|m\.)/i, "").replace(/^[^/]+\.(com|net)\//i, "");
  return path.replace(/^@/, "").split(/[/?#]/)[0] ?? "";
}
