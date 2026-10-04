import "server-only";

// This app's OfferingStore: the offerings table
// (supabase/migrations/20261003120000_offerings.sql). Service-role client,
// so every query here filters by the scope's tenant: that filter is what
// keeps one studio's offerings from another.

import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Offering, OfferingInput } from "../../core/model";
import { OfferingError, type OfferingStore } from "../../ports";

interface Row {
  id: string;
  kind: Offering["kind"];
  name: string;
  description: string | null;
  price: number | string;
  inclusions: string[];
  archived_at: string | null;
  created_at: string;
}

const COLUMNS = "id, kind, name, description, price, inclusions, archived_at, created_at";

const toOffering = (r: Row): Offering => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  description: r.description,
  // bigint may arrive as a string.
  price: Number(r.price),
  inclusions: r.inclusions,
  archivedAt: r.archived_at,
  createdAt: r.created_at,
});

/** The writable columns, named one by one: nothing else a caller passes ever reaches the table. */
const toColumns = (input: OfferingInput) => ({
  kind: input.kind,
  name: input.name,
  description: input.description,
  price: input.price,
  inclusions: input.inclusions,
});

const UNIQUE_VIOLATION = "23505";

function fail(what: string, error: { code?: string; message: string }): never {
  // Two saves of the same name at once: the database's unique index caught it.
  if (error.code === UNIQUE_VIOLATION) throw new OfferingError("Another package or service already has this name.");
  throw new Error(`offerings: could not ${what}: ${error.message}`);
}

/** A name as an exact, case-insensitive ilike pattern (no wildcards). */
const exactly = (name: string) => name.replace(/[\\%_]/g, "\\$&");

const table = () => createAdminClient().from("offerings");

export const supabaseOfferingStore: OfferingStore = {
  async list(scope, archived) {
    const query = table().select(COLUMNS).eq("tenant_id", scope.tenantId);
    const { data, error } = await (archived ? query.not("archived_at", "is", null) : query.is("archived_at", null)).returns<Row[]>();
    if (error) fail("list packages and services", error);
    return data.map(toOffering);
  },

  async get(scope, id) {
    const { data, error } = await table().select(COLUMNS).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<Row>();
    if (error) fail("load the package or service", error);
    return data ? toOffering(data) : null;
  },

  async findActiveByName(scope, name) {
    const { data, error } = await table()
      .select(COLUMNS)
      .eq("tenant_id", scope.tenantId)
      .is("archived_at", null)
      .ilike("name", exactly(name))
      .maybeSingle<Row>();
    if (error) fail("look up the name", error);
    return data ? toOffering(data) : null;
  },

  async create(scope, input) {
    const { data, error } = await table()
      .insert({ ...toColumns(input), tenant_id: scope.tenantId })
      .select(COLUMNS)
      .single<Row>();
    if (error) fail("save the package or service", error);
    return toOffering(data);
  },

  async update(scope, id, input) {
    return write(scope, id, toColumns(input), "save the package or service");
  },

  async setArchived(scope, id, archived) {
    return write(scope, id, { archived_at: archived ? new Date().toISOString() : null }, "archive the package or service");
  },
};

async function write(scope: TenantScope, id: string, values: ReturnType<typeof toColumns> | { archived_at: string | null }, what: string) {
  const { data, error } = await table()
    .update(values)
    .eq("tenant_id", scope.tenantId)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle<Row>();
  if (error) fail(what, error);
  return data ? toOffering(data) : null;
}
