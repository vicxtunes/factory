// Vendors: someone joining to offer their services to photographers, and
// finding their own vendor side again. Storage is a port (./ports.ts).

import type { Vendor, VendorJoin } from "./core";
import type { VendorStore } from "./ports";

export class VendorService {
  constructor(private readonly store: VendorStore) {}

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
}
