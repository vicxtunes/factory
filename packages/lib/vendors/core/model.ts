// The vendors module's records. Pure; safe on client and server.

import type { SocialNetwork } from "./categories";
import type { VendorOffer } from "./services";

/** A freelancer on their own, or a company or team. */
export type VendorKind = "individual" | "business";

export type VendorStatus = "active" | "suspended";

/**
 * Someone offering their services to photographers and their clients, with
 * their own side of Aming (/vendors). Not a business: no studio set-up,
 * review or workspace. One per Aming account.
 */
export interface Vendor {
  id: string;
  /** Their Aming account. */
  clientId: string;
  /** Their own name, or their business's. */
  name: string;
  kind: VendorKind;
  /** One of VENDOR_CATEGORIES. */
  category: string;
  /** What they offer: from VENDOR_SKILLS, or their own words. */
  skills: string[];
  /** Plain handles (a website without its scheme), by network. */
  socials: Partial<Record<SocialNetwork, string>>;
  /** A few lines about them, in their words. */
  bio: string | null;
  /** Where they work from ("Kampala"). */
  location: string | null;
  /** Their services, with prices and samples, the oldest first. */
  offers: VendorOffer[];
  /** Taking work now (their hire card says "Available for work"), or busy. */
  available: boolean;
  /** A short line of their own on their hire card ("Taking December weddings"). */
  statusLine: string | null;
  /** Their profile photo and cover, in the photo bucket. */
  photoKey: string | null;
  coverKey: string | null;
  status: VendorStatus;
  createdAt: string;
}

/** What a vendor can change on their profile (vendorProfileSchema's output). */
export interface VendorProfile {
  name: string;
  kind: VendorKind;
  category: string;
  skills: string[];
  socials: Vendor["socials"];
  bio: string | null;
  location: string | null;
}

/** What a vendor gives when they join (vendorJoinSchema's output). */
export interface VendorJoin {
  kind: VendorKind;
  /** A business's own name; null for an individual, who goes by their account's name. */
  businessName: string | null;
  category: string;
  skills: string[];
  socials: Vendor["socials"];
}
