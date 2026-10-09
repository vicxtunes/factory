// Studio use cases over a StudioStore. No database or framework code, so it
// runs on any store (tests use an in-memory one, ./service.test.ts).
// Callers check who's asking and parse the input first (./actions.ts).

import { readableBrandColor, type Studio, type StudioListing, type StudioOwner, type StudioProfile } from "./core";
import type { StudioStore } from "./ports";

export class StudioService {
  constructor(private readonly store: StudioStore) {}

  /** The owner's studio, created the first time they open it. */
  async open(owner: StudioOwner): Promise<Studio> {
    return (await this.store.findByOwner(owner.clientId)) ?? this.store.create(owner);
  }

  /**
   * Changes a studio's profile. Callers pass the id of the caller's own
   * studio (server.ts → studioOfCaller), never one sent by the browser.
   */
  async updateProfile(studioId: string, profile: StudioProfile): Promise<Studio> {
    return this.store.updateProfile(studioId, profile);
  }

  /** Sets a studio's brand color (same caller rule as updateProfile), made readable first. */
  async setBrandColor(studioId: string, color: string): Promise<Studio> {
    return this.store.setBrandColor(studioId, readableBrandColor(color));
  }

  /** Every studio, newest first. Boss only (checked by the caller). */
  async list(): Promise<StudioListing[]> {
    return (await this.store.list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** One studio. Boss only (checked by the caller). */
  async get(id: string): Promise<StudioListing | null> {
    return this.store.get(id);
  }
}
