import "server-only";

// This app's CustomerStore: the customers table
// (supabase/migrations/20261003110000_customers.sql). Service-role client,
// so every query here filters by the scope's tenant: that filter is what
// keeps one studio's customers from another.

import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Customer, CustomerInput } from "../../core/model";
import { CustomerError, type CustomerStore } from "../../ports";

interface Row {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
}

const COLUMNS = "id, name, phone, email, notes, archived_at, created_at";

const toCustomer = (r: Row): Customer => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  email: r.email,
  notes: r.notes,
  archivedAt: r.archived_at,
  createdAt: r.created_at,
});

const UNIQUE_VIOLATION = "23505";

function fail(what: string, error: { code?: string; message: string }): never {
  // Two saves of the same number at once: the database's unique index caught it.
  if (error.code === UNIQUE_VIOLATION) throw new CustomerError("Another client already has this phone number.");
  throw new Error(`customers: could not ${what}: ${error.message}`);
}

/** The customers table, already narrowed to one tenant. */
const table = () => createAdminClient().from("customers");

export const supabaseCustomerStore: CustomerStore = {
  async list(scope, archived) {
    const query = table().select(COLUMNS).eq("tenant_id", scope.tenantId);
    const { data, error } = await (archived ? query.not("archived_at", "is", null) : query.is("archived_at", null)).returns<Row[]>();
    if (error) fail("list clients", error);
    return data.map(toCustomer);
  },

  async get(scope, id) {
    const { data, error } = await table().select(COLUMNS).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<Row>();
    if (error) fail("load the client", error);
    return data ? toCustomer(data) : null;
  },

  async findByPhone(scope, phone) {
    const { data, error } = await table().select(COLUMNS).eq("tenant_id", scope.tenantId).eq("phone", phone).maybeSingle<Row>();
    if (error) fail("look up the phone number", error);
    return data ? toCustomer(data) : null;
  },

  async create(scope, input) {
    const { data, error } = await table()
      .insert({ ...input, tenant_id: scope.tenantId })
      .select(COLUMNS)
      .single<Row>();
    if (error) fail("save the client", error);
    return toCustomer(data);
  },

  async update(scope, id, input) {
    return write(scope, id, input, "save the client");
  },

  async setArchived(scope, id, archived) {
    return write(scope, id, { archived_at: archived ? new Date().toISOString() : null }, "archive the client");
  },
};

async function write(scope: TenantScope, id: string, values: Partial<CustomerInput> | { archived_at: string | null }, what: string) {
  const { data, error } = await table()
    .update(values)
    .eq("tenant_id", scope.tenantId)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle<Row>();
  if (error) fail(what, error);
  return data ? toCustomer(data) : null;
}
