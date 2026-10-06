import "server-only";

// This app's OfferingStore: the offering_categories, offering_services,
// offerings and offering_settings tables
// (supabase/migrations/20261003120000_offerings.sql,
// 20261006100000_offering_services.sql, 20261007100000_offering_categories.sql,
// 20261009110000_studio_products.sql).
// Service-role client, so every
// query here filters by the scope's tenant: that filter is what keeps one
// studio's services and packages from another.

import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Category, Offering, OfferingInput, OfferingKind, Service, ShowroomSettings } from "../../core/model";
import { OfferingError, type OfferingStore } from "../../ports";

interface CategoryRow {
  id: string;
  kind: OfferingKind;
  name: string;
  position: number;
  archived_at: string | null;
  created_at: string;
}

interface ServiceRow {
  id: string;
  kind: OfferingKind;
  category_id: string;
  name: string;
  slug: string;
  description: string | null;
  source_product_id: string | null;
  hidden_media: string[];
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

const CATEGORY = "id, kind, name, position, archived_at, created_at";
const SERVICE = "id, kind, category_id, name, slug, description, source_product_id, hidden_media, position, archived_at, created_at";
const PACKAGE =
  "id, service_id, name, description, price, inclusions, position, archived_at, created_at, service:offering_services!offerings_service_fkey (name)";

const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  position: r.position,
  archivedAt: r.archived_at,
  createdAt: r.created_at,
});

const toService = (r: ServiceRow): Service => ({
  id: r.id,
  kind: r.kind,
  categoryId: r.category_id,
  name: r.name,
  slug: r.slug,
  description: r.description,
  sourceProductId: r.source_product_id,
  hiddenMedia: r.hidden_media,
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
const servicePatch = (patch: Parameters<OfferingStore["updateService"]>[2]) => ({
  ...(patch.name !== undefined ? { name: patch.name } : {}),
  ...(patch.description !== undefined ? { description: patch.description } : {}),
  ...(patch.categoryId !== undefined ? { category_id: patch.categoryId } : {}),
  ...(patch.hiddenMedia !== undefined ? { hidden_media: patch.hiddenMedia } : {}),
});
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

const categories = () => createAdminClient().from("offering_categories");
const services = () => createAdminClient().from("offering_services");
const packages = () => createAdminClient().from("offerings");

/** One past the largest position in the query's rows: new ones go last. */
async function nextPosition(query: PromiseLike<{ data: { position: number }[] | null; error: { message: string } | null }>, what: string) {
  const { data, error } = await query;
  if (error) fail(what, error);
  return (data?.[0]?.position ?? 0) + 1;
}

export const supabaseOfferingStore: OfferingStore = {
  async categories(scope) {
    const { data, error } = await categories().select(CATEGORY).eq("tenant_id", scope.tenantId).returns<CategoryRow[]>();
    if (error) fail("list categories", error);
    return data.map(toCategory);
  },

  async category(scope, id) {
    const { data, error } = await categories().select(CATEGORY).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<CategoryRow>();
    if (error) fail("load the category", error);
    return data ? toCategory(data) : null;
  },

  async findActiveCategory(scope, kind, name) {
    const { data, error } = await categories()
      .select(CATEGORY)
      .eq("tenant_id", scope.tenantId)
      .eq("kind", kind)
      .is("archived_at", null)
      .ilike("name", exactly(name))
      .maybeSingle<CategoryRow>();
    if (error) fail("look up the name", error);
    return data ? toCategory(data) : null;
  },

  async createCategory(scope, kind, name) {
    const position = await nextPosition(
      categories().select("position").eq("tenant_id", scope.tenantId).order("position", { ascending: false }).limit(1),
      "save the category",
    );
    const { data, error } = await categories().insert({ kind, name, position, tenant_id: scope.tenantId }).select(CATEGORY).single<CategoryRow>();
    if (error) fail("save the category", error);
    return toCategory(data);
  },

  async renameCategory(scope, id, name) {
    return writeCategory(scope, id, { name }, "rename the category");
  },

  async setCategoryArchived(scope, id, archived) {
    return writeCategory(scope, id, { archived_at: archived ? new Date().toISOString() : null }, "deactivate the category");
  },

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

  async serviceBySlug(scope, slug) {
    const { data, error } = await services().select(SERVICE).eq("tenant_id", scope.tenantId).eq("slug", slug).maybeSingle<ServiceRow>();
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
      .insert({
        kind: input.kind,
        name: input.name,
        description: input.description,
        category_id: input.categoryId,
        slug: input.slug,
        source_product_id: input.sourceProductId,
        position,
        tenant_id: scope.tenantId,
      })
      .select(SERVICE)
      .single<ServiceRow>();
    if (error) fail("save the service", error);
    return toService(data);
  },

  async updateService(scope, id, patch) {
    return writeService(scope, id, servicePatch(patch), "save the service");
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

  async settings(scope) {
    const { data, error } = await createAdminClient()
      .from("offering_settings")
      .select("show_prices, view_mode")
      .eq("tenant_id", scope.tenantId)
      .maybeSingle<{ show_prices: boolean; view_mode: ShowroomSettings["viewMode"] }>();
    if (error) fail("load the showroom settings", error);
    return data ? { showPrices: data.show_prices, viewMode: data.view_mode } : null;
  },

  async saveSettings(scope, settings) {
    const { error } = await createAdminClient()
      .from("offering_settings")
      .upsert({ tenant_id: scope.tenantId, show_prices: settings.showPrices, view_mode: settings.viewMode });
    if (error) fail("save the showroom settings", error);
  },
};

async function writeCategory(scope: TenantScope, id: string, values: object, what: string) {
  const { data, error } = await categories().update(values).eq("tenant_id", scope.tenantId).eq("id", id).select(CATEGORY).maybeSingle<CategoryRow>();
  if (error) fail(what, error);
  return data ? toCategory(data) : null;
}

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
