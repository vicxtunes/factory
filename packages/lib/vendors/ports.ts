// What a host app must provide for vendors. This app's implementation is in
// ./adapters/supabase.

import { AppError } from "@repo/lib/kernel/core";

import type { VendorPicture } from "./core/categories";
import type { Vendor, VendorJoin, VendorProfile } from "./core/model";

export interface VendorStore {
  /** The vendor behind an Aming account, if it has joined. */
  byClient(clientId: string): Promise<Vendor | null>;
  /** A new vendor for the account; the one it has, when it joined meanwhile. */
  create(clientId: string, name: string, join: Omit<VendorJoin, "businessName">): Promise<Vendor>;
  updateProfile(id: string, profile: VendorProfile): Promise<Vendor>;
  /** The vendor's workspace for its files (a tenant with no owner), made on first use. */
  workspace(id: string): Promise<string>;
  /** Sets one of the vendor's pictures; returns the key it replaced. */
  setPicture(id: string, which: VendorPicture, key: string): Promise<string | null>;
}

/** The picture files (R2): a signed upload link, then checked and moved into place. */
export interface VendorFiles {
  putUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  getUrl(key: string, expiresInSeconds: number): Promise<string>;
  size(key: string): Promise<number | null>;
  move(fromKey: string, toKey: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** A problem the person should see (the message is safe to show). */
export class VendorError extends AppError {}
