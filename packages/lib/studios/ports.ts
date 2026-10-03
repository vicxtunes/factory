// What a host app must provide to store studios. This app's implementation
// is ./adapters/supabase/store.ts.

import { AppError } from "@repo/lib/kernel/core";

import type { Studio, StudioListing, StudioOwner, StudioProfile } from "./core/model";

export interface StudioStore {
  findByOwner(clientId: string): Promise<Studio | null>;
  /**
   * Creates the owner's studio. If one already exists (two tabs opening it
   * at once), returns that one instead: one studio per client.
   */
  create(owner: StudioOwner): Promise<Studio>;
  updateProfile(id: string, profile: StudioProfile): Promise<Studio>;
  /** Every studio, for the boss. */
  list(): Promise<StudioListing[]>;
  get(id: string): Promise<StudioListing | null>;
}

/** A problem the person should see (the message is safe to show). */
export class StudioError extends AppError {}
