// What a host app must provide for vendors. This app's implementation is in
// ./adapters/supabase.

import { AppError } from "@repo/lib/kernel/core";

import type { Vendor, VendorJoin, VendorProfile } from "./core/model";

export interface VendorStore {
  /** The vendor behind an Aming account, if it has joined. */
  byClient(clientId: string): Promise<Vendor | null>;
  /** A new vendor for the account; the one it has, when it joined meanwhile. */
  create(clientId: string, name: string, join: Omit<VendorJoin, "businessName">): Promise<Vendor>;
  updateProfile(id: string, profile: VendorProfile): Promise<Vendor>;
}

/** A problem the person should see (the message is safe to show). */
export class VendorError extends AppError {}
