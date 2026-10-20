import "server-only";

// This app's VendorStore: the `vendors` table
// (supabase/migrations/20261108100000_vendors_apart.sql), with their services
// and samples (20261115100000_vendor_services.sql). Service-role
// client, so this file is the only place vendor rows are read or written.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Vendor } from "../../core/model";
import type { OfferInput, RateUnit, VendorOffer } from "../../core/services";
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
  offers: OfferRow[];
  photo_key: string | null;
  cover_key: string | null;
  status: Vendor["status"];
  created_at: string;
}

interface OfferRow {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  unit: RateUnit | null;
  created_at: string;
  samples: { id: string; key: string; created_at: string }[];
}

const OFFER_COLUMNS = "id, name, description, price, unit, created_at, samples:vendor_service_samples (id, key, created_at)";
const COLUMNS = `id, client_id, name, kind, category, skills, socials, bio, location, photo_key, cover_key, status, created_at, offers:vendor_services (${OFFER_COLUMNS})`;

const oldestFirst = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at);

const toOffer = (r: OfferRow): VendorOffer => ({
  id: r.id,
  name: r.name,
  description: r.description,
  // bigint may arrive as a string.
  price: r.price === null ? null : Number(r.price),
  unit: r.unit,
  samples: [...r.samples].sort(oldestFirst).map((s) => ({ id: s.id, key: s.key })),
});

const offerColumns = (o: OfferInput) => ({ name: o.name, description: o.description, price: o.price, unit: o.unit });

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
  offers: [...r.offers].sort(oldestFirst).map(toOffer),
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
const services = () => createAdminClient().from("vendor_services");
const samples = () => createAdminClient().from("vendor_service_samples");

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

  async walletBalance(id) {
    const { data, error } = await createAdminClient().from("vendor_wallets").select("balance").eq("vendor_id", id).maybeSingle<{ balance: number | string }>();
    if (error) fail("load the wallet", error);
    return Number(data?.balance ?? 0);
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

  async setPicture(id, which, key) {
    const column = which === "photo" ? "photo_key" : "cover_key";
    const { data: before, error: readError } = await vendors().select(column).eq("id", id).single<Record<string, string | null>>();
    if (readError) fail("load the picture", readError);
    const { error } = await vendors().update({ [column]: key }).eq("id", id);
    if (error) fail("save the picture", error);
    return before[column] ?? null;
  },

  async createOffer(vendorId, offer) {
    const { data, error } = await services().insert({ vendor_id: vendorId, ...offerColumns(offer) }).select(OFFER_COLUMNS).single<OfferRow>();
    if (error) fail("save the service", error);
    return toOffer(data);
  },

  async updateOffer(vendorId, id, offer) {
    const { data, error } = await services().update(offerColumns(offer)).eq("vendor_id", vendorId).eq("id", id).select("id");
    if (error) fail("save the service", error);
    return data.length > 0;
  },

  async deleteOffer(vendorId, id) {
    const { data, error } = await services().delete().eq("vendor_id", vendorId).eq("id", id).select("samples:vendor_service_samples (key)").returns<{ samples: { key: string }[] }[]>();
    if (error) fail("delete the service", error);
    return data[0] ? data[0].samples.map((s) => s.key) : null;
  },

  async addSample(vendorId, offerId, key) {
    const { error } = await samples().insert({ vendor_id: vendorId, service_id: offerId, key });
    if (error) fail("save the sample", error);
  },

  async removeSample(vendorId, id) {
    const { data, error } = await samples().delete().eq("vendor_id", vendorId).eq("id", id).select("key").returns<{ key: string }[]>();
    if (error) fail("delete the sample", error);
    return data[0]?.key ?? null;
  },
};
