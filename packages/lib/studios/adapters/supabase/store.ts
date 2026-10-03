import "server-only";

// This app's StudioStore: studios are rows of `tenants` with an owner
// (supabase/migrations/20261003100000_studios.sql). Service-role client, so
// this file is the only place studio rows are read or written.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Studio, StudioListing } from "../../core/model";
import type { StudioStore } from "../../ports";

interface Row {
  id: string;
  owner_client_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
}

const COLUMNS = "id, owner_client_id, name, phone, email, address, created_at";

const toStudio = (r: Row): Studio => ({
  id: r.id,
  ownerClientId: r.owner_client_id,
  name: r.name,
  phone: r.phone,
  email: r.email,
  address: r.address,
  createdAt: r.created_at,
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
    const { data, error } = await studios().eq("owner_client_id", clientId).maybeSingle<Row>();
    if (error) fail("load the studio", error);
    return data ? toStudio(data) : null;
  },

  async create(owner) {
    const { data, error } = await createAdminClient()
      .from("tenants")
      .insert({ owner_client_id: owner.clientId, name: owner.name })
      .select(COLUMNS)
      .single<Row>();
    if (data) return toStudio(data);
    // Opened twice at once: the other request created it first.
    if (error?.code === UNIQUE_VIOLATION) {
      const existing = await this.findByOwner(owner.clientId);
      if (existing) return existing;
    }
    fail("create the studio", error ?? { message: "no row returned" });
  },

  async updateProfile(id, profile) {
    const { data, error } = await createAdminClient()
      .from("tenants")
      .update(profile)
      .eq("id", id)
      .not("owner_client_id", "is", null)
      .select(COLUMNS)
      .single<Row>();
    if (error) fail("save the studio", error);
    return toStudio(data);
  },

  async list() {
    const { data, error } = await createAdminClient()
      .from("tenants")
      .select(`${COLUMNS}, owner:clients (name)`)
      .not("owner_client_id", "is", null)
      .returns<ListingRow[]>();
    if (error) fail("list studios", error);
    return data.map(toListing);
  },

  async get(id) {
    const { data, error } = await createAdminClient()
      .from("tenants")
      .select(`${COLUMNS}, owner:clients (name)`)
      .eq("id", id)
      .not("owner_client_id", "is", null)
      .maybeSingle<ListingRow>();
    if (error) fail("load the studio", error);
    return data ? toListing(data) : null;
  },
};
