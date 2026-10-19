// What vendors do, what each kind offers, and where they show their work. Pure.
//
// A vendor is someone offering their services to photographers and their
// clients: photo editors, videographers, photographers, graphic designers
// and equipment hire first (Aming's focus), then event, beauty and transport
// vendors. The lists live here, not in the database, so a new one is a line here.

export interface VendorCategory {
  id: string;
  label: string;
}

/** Every vendor category, the ones Aming focuses on first. */
export const VENDOR_CATEGORIES: VendorCategory[] = [
  { id: "photo_editor", label: "Photo editor" },
  { id: "videographer", label: "Videographer" },
  { id: "photographer", label: "Photographer" },
  { id: "graphic_designer", label: "Graphic designer" },
  { id: "equipment_hire", label: "Equipment hire" },
  { id: "decor", label: "Decor" },
  { id: "venue", label: "Venue" },
  { id: "tents_chairs", label: "Tents & chairs" },
  { id: "florist", label: "Florist" },
  { id: "lighting", label: "Lighting" },
  { id: "catering", label: "Catering" },
  { id: "cakes", label: "Cakes" },
  { id: "drinks", label: "Drinks & bar" },
  { id: "sound_dj", label: "Sound & DJ" },
  { id: "mc", label: "MC" },
  { id: "band", label: "Band" },
  { id: "dancers", label: "Dancers" },
  { id: "makeup_hair", label: "Makeup & hair" },
  { id: "bridal_wear", label: "Bridal wear" },
  { id: "car_hire", label: "Car hire" },
];

export const vendorCategory = (id: string | null | undefined): VendorCategory | null => VENDOR_CATEGORIES.find((c) => c.id === id) ?? null;

/** A vendor's two pictures: the round profile photo and the wide cover behind it. */
export type VendorPicture = "photo" | "cover";

/** The longest side each is shrunk to in the browser before it's uploaded, and the most it may weigh. */
export const PICTURE_EDGE: Record<VendorPicture, number> = { photo: 512, cover: 1600 };
export const PICTURE_MAX_BYTES = 1_500_000;

/** Aming's fee, in percent of what a vendor's clients pay through Aming. */
export const VENDOR_FEE_PERCENT = 10;

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
