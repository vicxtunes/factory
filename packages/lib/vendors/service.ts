// Vendors: someone joining to offer their services to photographers, and
// finding their own vendor side again. Storage is a port (./ports.ts).

import { PICTURE_MAX_BYTES, type Vendor, type VendorJoin, type VendorPicture, type VendorProfile } from "./core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { VendorError, type VendorFiles, type VendorStore } from "./ports";

export class VendorService {
  constructor(
    private readonly store: VendorStore,
    private readonly files: VendorFiles,
    private readonly newId: () => string,
  ) {}

  /** The account's vendor side, if it has joined. */
  async mine(clientId: string): Promise<Vendor | null> {
    return this.store.byClient(clientId);
  }

  /**
   * The account joins as a vendor, named after its business or else the
   * account's own name. Joining again gives the vendor it has, unchanged.
   */
  async join(account: { clientId: string; name: string }, join: VendorJoin): Promise<Vendor> {
    const existing = await this.store.byClient(account.clientId);
    if (existing) return existing;
    const { businessName, ...rest } = join;
    return this.store.create(account.clientId, businessName ?? account.name, rest);
  }

  /** Vendors a studio can hire: every word of `query` in their name, and maybe of one category. */
  async search(query: string, category: string | null): Promise<Vendor[]> {
    return this.store.search(query.split(/\s+/).filter(Boolean).slice(0, 5), category);
  }

  /** What's on the vendor's Business card: what studios paid them, less Aming's fee and withdrawals. */
  async cardBalance(vendor: Vendor): Promise<number> {
    return this.store.cardBalance(vendor.id);
  }

  /** The account's vendor, with its profile as edited. */
  async updateProfile(clientId: string, profile: VendorProfile): Promise<Vendor> {
    return this.store.updateProfile((await this.own(clientId)).id, profile);
  }

  /**
   * Where the vendor's files live (their Drive): their own workspace, made on
   * first use, in Kampala's currency, locale and time.
   */
  async driveScope(vendor: Vendor): Promise<TenantScope> {
    return { tenantId: await this.store.workspace(vendor.id), currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" };
  }

  /** A signed link the browser uploads one of its (already shrunk) pictures to. */
  async startPictureUpload(clientId: string, which: VendorPicture): Promise<{ key: string; url: string }> {
    const vendor = await this.own(clientId);
    const key = `incoming/vendors/${vendor.id}/${which}-${this.newId()}.jpg`;
    return { key, url: await this.files.putUrl(key, "image/jpeg", 600) };
  }

  /** Checks the uploaded picture and makes it the vendor's; the one it replaces is deleted. */
  async confirmPicture(clientId: string, which: VendorPicture, key: string): Promise<void> {
    const vendor = await this.own(clientId);
    if (!key.startsWith(`incoming/vendors/${vendor.id}/${which}-`)) throw new VendorError("That upload isn't valid.");
    const size = await this.files.size(key);
    if (size === null) throw new VendorError("The picture didn't arrive. Try uploading it again.");
    if (size === 0 || size > PICTURE_MAX_BYTES) {
      await this.files.remove([key]);
      throw new VendorError("That picture is too large. Try a smaller one.");
    }
    const final = `vendors/${vendor.id}/${which}-${this.newId()}.jpg`;
    await this.files.move(key, final);
    const old = await this.store.setPicture(vendor.id, which, final);
    if (old) await this.files.remove([old]);
  }

  /** A short-lived link to show a picture (the bucket is private). Null when there's none or storage is unreachable. */
  async pictureUrl(key: string | null): Promise<string | null> {
    if (!key) return null;
    try {
      return await this.files.getUrl(key, 3600);
    } catch (error) {
      console.error("vendors: picture link failed", error);
      return null;
    }
  }

  private async own(clientId: string): Promise<Vendor> {
    const vendor = await this.store.byClient(clientId);
    if (!vendor) throw new VendorError("Join as a vendor first.");
    return vendor;
  }
}
