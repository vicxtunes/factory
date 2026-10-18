// The vendors module's records. Pure; safe on client and server.

import type { SocialNetwork } from "./categories";

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
  status: VendorStatus;
  createdAt: string;
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
