import "server-only";

// This app's VendorStore: the `vendors` table
// (supabase/migrations/20261108100000_vendors_apart.sql). Service-role
// client, so this file is the only place vendor rows are read or written.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Vendor } from "../../core/model";
import type { VendorStore } from "../../ports";

interface Row {
  id: string;
  client_id: string;
  name: string;
  kind: Vendor["kind"];
  category: string;
  skills: string[];
  socials: Vendor["socials"];
  bio: string | null;
  location: string | null;
  status: Vendor["status"];
  created_at: string;
}

const COLUMNS = "id, client_id, name, kind, category, skills, socials, bio, location, status, created_at";

const toVendor = (r: Row): Vendor => ({
  id: r.id,
  clientId: r.client_id,
  name: r.name,
  kind: r.kind,
  category: r.category,
  skills: r.skills,
  socials: r.socials,
  bio: r.bio,
  location: r.location,
  status: r.status,
  createdAt: r.created_at,
});

const UNIQUE_VIOLATION = "23505";

function fail(what: string, error: { message: string }): never {
  throw new Error(`vendors: could not ${what}: ${error.message}`);
}

const vendors = () => createAdminClient().from("vendors");

export const supabaseVendorStore: VendorStore = {
  async byClient(clientId) {
    const { data, error } = await vendors().select(COLUMNS).eq("client_id", clientId).maybeSingle<Row>();
    if (error) fail("load the vendor", error);
    return data ? toVendor(data) : null;
  },

  async create(clientId, name, join) {
    const { data, error } = await vendors()
      .insert({ client_id: clientId, name, kind: join.kind, category: join.category, skills: join.skills, socials: join.socials })
      .select(COLUMNS)
      .single<Row>();
    if (data) return toVendor(data);
    // Joined twice at once: the other request made it first.
    if (error?.code === UNIQUE_VIOLATION) {
      const existing = await this.byClient(clientId);
      if (existing) return existing;
    }
    fail("save the vendor", error ?? { message: "no row returned" });
  },

  async updateProfile(id, profile) {
    const { data, error } = await vendors()
      // Named one by one: nothing else a caller passes (the account, the status) reaches the row.
      .update({
        name: profile.name,
        kind: profile.kind,
        category: profile.category,
        skills: profile.skills,
        socials: profile.socials,
        bio: profile.bio,
        location: profile.location,
      })
      .eq("id", id)
      .select(COLUMNS)
      .single<Row>();
    if (error) fail("save the profile", error);
    return toVendor(data);
  },
};
