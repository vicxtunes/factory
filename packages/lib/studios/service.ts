// Studio use cases over a StudioStore. No database or framework code, so it
// runs on any store (tests use an in-memory one, ./service.test.ts).
// Callers check who's asking and parse the input first (./actions.ts).

import { readableBrandColor, vendorCategory, type BusinessKind, type OwnedBusinesses, type Studio, type StudioListing, type StudioOwner, type StudioProfile, type VendorProfile } from "./core";
import { StudioError, type StudioStore } from "./ports";

export class StudioService {
  constructor(private readonly store: StudioStore) {}

  /**
   * The owner's business of a kind, created the first time they open it (a
   * vendor with its category). A studio is what an account starts with.
   */
  async open(owner: StudioOwner, kind: BusinessKind = "studio", category: string | null = null): Promise<Studio> {
    const mine = (await this.store.findByOwner(owner.clientId)).find((b) => b.kind === kind);
    if (mine) return mine;
    if (kind === "vendor" && !vendorCategory(category)) throw new StudioError("Choose what your business does.");
    return this.store.create(owner, kind, kind === "vendor" ? category : null);
  }

  /** The account's businesses, if it has opened any (none is created). */
  async owned(clientId: string): Promise<OwnedBusinesses> {
    const all = await this.store.findByOwner(clientId);
    return { studio: all.find((b) => b.kind === "studio") ?? null, vendor: all.find((b) => b.kind === "vendor") ?? null };
  }

  /**
   * Changes what a business is, while it's being set up (the caller checks
   * its status and that it's the caller's own): a studio, or a vendor and
   * its category.
   */
  async setKind(studioId: string, kind: BusinessKind, category: string | null): Promise<Studio> {
    if (kind === "vendor" && !vendorCategory(category)) throw new StudioError("Choose what your business does.");
    return this.store.setKind(studioId, kind, kind === "vendor" ? category : null);
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

  /**
   * A vendor joining: its business opened with its sign-up answers. One they
   * already have keeps what it is once it's past its first set-up.
   */
  async joinAsVendor(owner: StudioOwner, join: { category: string; businessName: string | null; profile: VendorProfile }): Promise<Studio> {
    const vendor = await this.open(owner, "vendor", join.category);
    if (vendor.status !== "onboarding") return vendor;
    return this.store.setVendorProfile(vendor.id, join.businessName, join.profile);
  }

  /** Whether the business's work shows in the feed on Aming's front page. */
  async setShowOnAming(studioId: string, on: boolean): Promise<Studio> {
    return this.store.setShowOnAming(studioId, on);
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
