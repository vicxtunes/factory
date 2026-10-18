import "server-only";

// This app's StudioStore: studios are rows of `tenants` with an owner
// (supabase/migrations/20261003100000_studios.sql). Service-role client, so
// this file is the only place studio rows are read or written.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Studio, StudioListing, VendorProfile } from "../../core/model";
import { StudioError, type StudioStore } from "../../ports";

interface Row {
  id: string;
  owner_client_id: string;
  kind: Studio["kind"];
  vendor_category: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  currency: string;
  locale: string;
  time_zone: string;
  created_at: string;
  status: Studio["status"];
  logo_key: string | null;
  brand_color: string | null;
  show_on_aming: boolean;
  vendor_profile: VendorProfile | null;
}

const COLUMNS = "id, owner_client_id, kind, vendor_category, name, phone, email, address, latitude, longitude, currency, locale, time_zone, created_at, status, logo_key, brand_color, show_on_aming, vendor_profile";

const toStudio = (r: Row): Studio => ({
  id: r.id,
  ownerClientId: r.owner_client_id,
  kind: r.kind,
  vendorCategory: r.vendor_category,
  name: r.name,
  phone: r.phone,
  email: r.email,
  address: r.address,
  location: r.latitude != null && r.longitude != null ? { lat: r.latitude, lng: r.longitude } : null,
  currency: r.currency,
  locale: r.locale,
  timeZone: r.time_zone,
  createdAt: r.created_at,
  status: r.status,
  logoKey: r.logo_key,
  brandColor: r.brand_color,
  showOnAming: r.show_on_aming,
  vendorProfile: r.vendor_profile,
});

type ListingRow = Row & { owner: { name: string } | null };

const toListing = (r: ListingRow): StudioListing => ({ ...toStudio(r), ownerName: r.owner?.name ?? "" });

const UNIQUE_VIOLATION = "23505";

function fail(what: string, error: { message: string }): never {
  throw new Error(`studios: could not ${what}: ${error.message}`);
}

/** Studios only: the default tenant (Aming) has no owner and is never a studio. */
const studios = () => createAdminClient().from("tenants").select(COLUMNS).not("owner_client_id", "is", null);

export const supabaseStudioStore: StudioStore = {
  async findByOwner(clientId) {
    const { data, error } = await studios().eq("owner_client_id", clientId).order("created_at").returns<Row[]>();
    if (error) fail("load the business", error);
    return data.map(toStudio);
  },

  async create(owner, kind, vendorCategory) {
    const { data, error } = await createAdminClient()
      .from("tenants")
      .insert({ owner_client_id: owner.clientId, name: owner.name, kind, vendor_category: vendorCategory })
      .select(COLUMNS)
      .single<Row>();
    if (data) return toStudio(data);
    // Opened twice at once: the other request created it first.
    if (error?.code === UNIQUE_VIOLATION) {
      const existing = (await this.findByOwner(owner.clientId)).find((b) => b.kind === kind);
      if (existing) return existing;
    }
    fail("create the business", error ?? { message: "no row returned" });
  },

  async setKind(id, kind, vendorCategory) {
    const { data, error } = await createAdminClient()
      .from("tenants")
      .update({ kind, vendor_category: vendorCategory })
      .eq("id", id)
      .not("owner_client_id", "is", null)
      .select(COLUMNS)
      .single<Row>();
    if (error?.code === UNIQUE_VIOLATION) throw new StudioError(`You already have a ${kind === "vendor" ? "vendor business" : "studio"}: switch to it from the business menu.`);
    if (error) fail("save what the business is", error);
    return toStudio(data);
  },

  async updateProfile(id, profile) {
    const { data, error } = await createAdminClient()
      .from("tenants")
      // Named one by one: nothing else a caller passes (an owner, is_default) ever reaches tenants.
      .update({
        name: profile.name,
        phone: profile.phone,
        email: profile.email,
        address: profile.address,
        latitude: profile.location?.lat ?? null,
        longitude: profile.location?.lng ?? null,
      })
      .eq("id", id)
      .not("owner_client_id", "is", null)
      .select(COLUMNS)
      .single<Row>();
    if (error) fail("save the business", error);
    return toStudio(data);
  },

  async setBrandColor(id, color) {
    const { data, error } = await createAdminClient()
      .from("tenants")
      .update({ brand_color: color })
      .eq("id", id)
      .not("owner_client_id", "is", null)
      .select(COLUMNS)
      .single<Row>();
    if (error) fail("save the color", error);
    return toStudio(data);
  },

  async setVendorProfile(id, name, profile) {
    const { data, error } = await createAdminClient()
      .from("tenants")
      .update({ vendor_profile: profile, ...(name ? { name } : {}) })
      .eq("id", id)
      .eq("kind", "vendor")
      .select(COLUMNS)
      .single<Row>();
    if (error) fail("save the vendor's profile", error);
    return toStudio(data);
  },

  async setShowOnAming(id, on) {
    const { data, error } = await createAdminClient()
      .from("tenants")
      .update({ show_on_aming: on })
      .eq("id", id)
      .not("owner_client_id", "is", null)
      .select(COLUMNS)
      .single<Row>();
    if (error) fail("save the setting", error);
    return toStudio(data);
  },

  async list() {
    const { data, error } = await createAdminClient()
      .from("tenants")
      .select(`${COLUMNS}, owner:clients (name)`)
      .not("owner_client_id", "is", null)
      .returns<ListingRow[]>();
    if (error) fail("list businesses", error);
    return data.map(toListing);
  },

  async get(id) {
    const { data, error } = await createAdminClient()
      .from("tenants")
      .select(`${COLUMNS}, owner:clients (name)`)
      .eq("id", id)
      .not("owner_client_id", "is", null)
      .maybeSingle<ListingRow>();
    if (error) fail("load the business", error);
    return data ? toListing(data) : null;
  },
};
