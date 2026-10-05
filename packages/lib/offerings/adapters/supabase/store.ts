import "server-only";

// This app's OfferingStore: the offering_services and offerings tables
// (supabase/migrations/20261003120000_offerings.sql,
// 20261006100000_offering_services.sql). Service-role client, so every
// query here filters by the scope's tenant: that filter is what keeps one
// studio's services and packages from another.

import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Offering, OfferingInput, Service, ServiceInput } from "../../core/model";
import { OfferingError, type OfferingStore } from "../../ports";

interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  archived_at: string | null;
  created_at: string;
}

interface PackageRow {
  id: string;
  service_id: string;
  name: string;
  description: string | null;
  price: number | string;
  inclusions: string[];
  position: number;
  archived_at: string | null;
  created_at: string;
  service: { name: string };
}

const SERVICE = "id, name, slug, description, position, archived_at, created_at";
const PACKAGE =
  "id, service_id, name, description, price, inclusions, position, archived_at, created_at, service:offering_services!offerings_service_fkey (name)";

const toService = (r: ServiceRow): Service => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  description: r.description,
  position: r.position,
  archivedAt: r.archived_at,
  createdAt: r.created_at,
});

const toPackage = (r: PackageRow): Offering => ({
  id: r.id,
  serviceId: r.service_id,
  serviceName: r.service.name,
  name: r.name,
  description: r.description,
  // bigint may arrive as a string.
  price: Number(r.price),
  inclusions: r.inclusions,
  position: r.position,
  archivedAt: r.archived_at,
  createdAt: r.created_at,
});

/** The writable columns, named one by one: nothing else a caller passes ever reaches the tables. */
const serviceColumns = (input: ServiceInput) => ({ name: input.name, description: input.description });
const packageColumns = (input: OfferingInput) => ({
  name: input.name,
  description: input.description,
  price: input.price,
  inclusions: input.inclusions,
});

const UNIQUE_VIOLATION = "23505";

function fail(what: string, error: { code?: string; message: string }): never {
  // Two saves of the same name at once: the database's unique index caught it.
  if (error.code === UNIQUE_VIOLATION) throw new OfferingError("Something else on sale already has this name.");
  throw new Error(`offerings: could not ${what}: ${error.message}`);
}

/** A name as an exact, case-insensitive ilike pattern (no wildcards). */
const exactly = (name: string) => name.replace(/[\\%_]/g, "\\$&");

const services = () => createAdminClient().from("offering_services");
const packages = () => createAdminClient().from("offerings");

/** One past the largest position in the query's rows: new ones go last. */
async function nextPosition(query: PromiseLike<{ data: { position: number }[] | null; error: { message: string } | null }>, what: string) {
  const { data, error } = await query;
  if (error) fail(what, error);
  return (data?.[0]?.position ?? 0) + 1;
}

export const supabaseOfferingStore: OfferingStore = {
  async services(scope, archived) {
    const query = services().select(SERVICE).eq("tenant_id", scope.tenantId);
    const { data, error } = await (archived ? query.not("archived_at", "is", null) : query.is("archived_at", null)).returns<ServiceRow[]>();
    if (error) fail("list services", error);
    return data.map(toService);
  },

  async service(scope, id) {
    const { data, error } = await services().select(SERVICE).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<ServiceRow>();
    if (error) fail("load the service", error);
    return data ? toService(data) : null;
  },

  async findActiveService(scope, name) {
    const { data, error } = await services()
      .select(SERVICE)
      .eq("tenant_id", scope.tenantId)
      .is("archived_at", null)
      .ilike("name", exactly(name))
      .maybeSingle<ServiceRow>();
    if (error) fail("look up the name", error);
    return data ? toService(data) : null;
  },

  async serviceSlugs(scope) {
    const { data, error } = await services().select("slug").eq("tenant_id", scope.tenantId).returns<{ slug: string }[]>();
    if (error) fail("list service addresses", error);
    return data.map((r) => r.slug);
  },

  async createService(scope, input) {
    const position = await nextPosition(
      services().select("position").eq("tenant_id", scope.tenantId).order("position", { ascending: false }).limit(1),
      "save the service",
    );
    const { data, error } = await services()
      .insert({ ...serviceColumns(input), slug: input.slug, position, tenant_id: scope.tenantId })
      .select(SERVICE)
      .single<ServiceRow>();
    if (error) fail("save the service", error);
    return toService(data);
  },

  async updateService(scope, id, input) {
    return writeService(scope, id, serviceColumns(input), "save the service");
  },

  async setServiceArchived(scope, id, archived) {
    return writeService(scope, id, { archived_at: archived ? new Date().toISOString() : null }, "archive the service");
  },

  async packages(scope, { archived, serviceId }) {
    let query = packages().select(PACKAGE).eq("tenant_id", scope.tenantId);
    if (serviceId) query = query.eq("service_id", serviceId);
    const { data, error } = await (archived ? query.not("archived_at", "is", null) : query.is("archived_at", null)).returns<PackageRow[]>();
    if (error) fail("list packages", error);
    return data.map(toPackage);
  },

  async package(scope, id) {
    const { data, error } = await packages().select(PACKAGE).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<PackageRow>();
    if (error) fail("load the package", error);
    return data ? toPackage(data) : null;
  },

  async findActivePackage(scope, serviceId, name) {
    const { data, error } = await packages()
      .select(PACKAGE)
      .eq("tenant_id", scope.tenantId)
      .eq("service_id", serviceId)
      .is("archived_at", null)
      .ilike("name", exactly(name))
      .maybeSingle<PackageRow>();
    if (error) fail("look up the name", error);
    return data ? toPackage(data) : null;
  },

  async createPackage(scope, serviceId, input) {
    const position = await nextPosition(
      packages().select("position").eq("tenant_id", scope.tenantId).eq("service_id", serviceId).order("position", { ascending: false }).limit(1),
      "save the package",
    );
    const { data, error } = await packages()
      .insert({ ...packageColumns(input), service_id: serviceId, position, tenant_id: scope.tenantId })
      .select(PACKAGE)
      .single<PackageRow>();
    if (error) fail("save the package", error);
    return toPackage(data);
  },

  async updatePackage(scope, id, input) {
    return writePackage(scope, id, packageColumns(input), "save the package");
  },

  async setPackageArchived(scope, id, archived) {
    return writePackage(scope, id, { archived_at: archived ? new Date().toISOString() : null }, "archive the package");
  },
};

async function writeService(scope: TenantScope, id: string, values: object, what: string) {
  const { data, error } = await services().update(values).eq("tenant_id", scope.tenantId).eq("id", id).select(SERVICE).maybeSingle<ServiceRow>();
  if (error) fail(what, error);
  return data ? toService(data) : null;
}

async function writePackage(scope: TenantScope, id: string, values: object, what: string) {
  const { data, error } = await packages().update(values).eq("tenant_id", scope.tenantId).eq("id", id).select(PACKAGE).maybeSingle<PackageRow>();
  if (error) fail(what, error);
  return data ? toPackage(data) : null;
}
