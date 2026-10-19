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
  photo_key: string | null;
  cover_key: string | null;
  status: Vendor["status"];
  created_at: string;
}

const COLUMNS = "id, client_id, name, kind, category, skills, socials, bio, location, photo_key, cover_key, status, created_at";

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
  photoKey: r.photo_key,
  coverKey: r.cover_key,
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

  async get(id) {
    const { data, error } = await vendors().select(COLUMNS).eq("id", id).maybeSingle<Row>();
    if (error) fail("load the vendor", error);
    return data ? toVendor(data) : null;
  },

  async search(words, category) {
    let query = vendors().select(COLUMNS).eq("status", "active");
    // Each word somewhere in the name, whatever the capitals (% and _ taken literally).
    for (const word of words) query = query.ilike("name", `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    if (category) query = query.eq("category", category);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(30).returns<Row[]>();
    if (error) fail("find vendors", error);
    return data.map(toVendor);
  },

  async cardBalance(id) {
    const { data: vendor, error } = await vendors().select("workspace_id").eq("id", id).single<{ workspace_id: string | null }>();
    if (error) fail("load the vendor", error);
    if (!vendor.workspace_id) return 0;
    const { data: card, error: cardError } = await createAdminClient()
      .from("business_wallets")
      .select("balance")
      .eq("tenant_id", vendor.workspace_id)
      .maybeSingle<{ balance: number | string }>();
    if (cardError) fail("load the Business card", cardError);
    return Number(card?.balance ?? 0);
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

  async workspace(id) {
    const { data, error } = await createAdminClient().rpc("vendor_workspace", { p_vendor: id });
    if (error) fail("open the Drive", error);
    return data as string;
  },

  async setPicture(id, which, key) {
    const column = which === "photo" ? "photo_key" : "cover_key";
    const { data: before, error: readError } = await vendors().select(column).eq("id", id).single<Record<string, string | null>>();
    if (readError) fail("load the picture", readError);
    const { error } = await vendors().update({ [column]: key }).eq("id", id);
    if (error) fail("save the picture", error);
    return before[column] ?? null;
  },
};
