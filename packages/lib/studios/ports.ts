// What a host app must provide to store studios. This app's implementation
// is ./adapters/supabase/store.ts.

import { AppError } from "@repo/lib/kernel/core";

import type { BusinessKind } from "./core/kinds";
import type { Studio, StudioListing, StudioOwner, StudioProfile } from "./core/model";

export interface StudioStore {
  /** The account's businesses (one of each kind at most). */
  findByOwner(clientId: string): Promise<Studio[]>;
  /**
   * Creates the owner's business of a kind. If they have one already (two
   * tabs opening it at once), returns that one instead: one of each kind.
   */
  create(owner: StudioOwner, kind: BusinessKind, vendorCategory: string | null): Promise<Studio>;
  /** Changes what a business is (while it's being set up: the caller checks). Throws StudioError when the owner already has one of that kind. */
  setKind(id: string, kind: BusinessKind, vendorCategory: string | null): Promise<Studio>;
  updateProfile(id: string, profile: StudioProfile): Promise<Studio>;
  setBrandColor(id: string, color: string): Promise<Studio>;
  /** Every studio, for the boss. */
  list(): Promise<StudioListing[]>;
  get(id: string): Promise<StudioListing | null>;
}

/** A problem the person should see (the message is safe to show). */
export class StudioError extends AppError {}
