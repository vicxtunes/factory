// Offering use cases over an OfferingStore, the way Aming manages products:
// categories holding services (or products), each with its packages (a
// product's sizes), products picked from Aming's catalog, and the showroom's
// settings. No database or framework code, so it runs on any store (tests
// use an in-memory one, ./service.test.ts). Callers find the tenant from the
// session and parse the input first.

import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  type AmingPick,
  DEFAULT_SHOWROOM_SETTINGS,
  serviceSlug,
  uniqueSlug,
  type Category,
  type CategoryWithServices,
  type Offering,
  type OfferingInput,
  type OfferingKind,
  type SaveOutcome,
  type Service,
  type ServiceWithPackages,
  type ShowroomSettings,
} from "./core";
import { OfferingError, type OfferingStore } from "./ports";

const CATEGORY_GONE = "That category no longer exists.";
const SERVICE_GONE = "That service no longer exists.";
const PACKAGE_GONE = "That package no longer exists.";
const FROM_AMING = "This product's name and sizes are Aming's. Set your prices and description instead.";
const AMING_CATEGORY = "This category is Aming's: it holds Aming's products from there. Add your own products in a category of your own.";

const byPosition = <T extends { position: number; name: string }>(a: T, b: T) =>
  a.position - b.position || a.name.localeCompare(b.name);

export class OfferingService {
  constructor(private readonly store: OfferingStore) {}

  // --- Reading -----------------------------------------------------------------

  /**
   * Everything of one kind, for managing it: every category (deactivated
   * ones too) with every service (or product) and package, deactivated ones
   * included, in order.
   */
  async manage(scope: TenantScope, kind: OfferingKind): Promise<CategoryWithServices[]> {
    const [categories, services, packages] = await Promise.all([
      this.store.categories(scope).then((l) => l.filter((c) => c.kind === kind)),
      Promise.all([this.store.services(scope, false), this.store.services(scope, true)]).then((l) => l.flat()),
      Promise.all([this.store.packages(scope, { archived: false }), this.store.packages(scope, { archived: true })]).then((l) => l.flat()),
    ]);
    return group(categories, services, packages);
  }

  /** The showroom's services (or products): active categories with what's on sale in them (and its packages on sale), empty ones left out. */
  async showroom(scope: TenantScope, kind: OfferingKind): Promise<CategoryWithServices[]> {
    const [categories, services, packages] = await Promise.all([
      this.store.categories(scope),
      this.store.services(scope, false),
      this.store.packages(scope, { archived: false }),
    ]);
    return group(categories.filter((c) => c.kind === kind && !c.archivedAt), services, packages).filter((c) => c.services.length > 0);
  }

  /**
   * Every package on sale (its service and category on sale too), by service
   * then tier, services before products: what quotations and invoices pick
   * from. Bookings pick services' only.
   */
  async onSale(scope: TenantScope, kind?: OfferingKind): Promise<Offering[]> {
    const kinds: OfferingKind[] = kind ? [kind] : ["service", "product"];
    const rows = await Promise.all(kinds.map((k) => this.showroom(scope, k)));
    return rows.flat().flatMap((c) => c.services.flatMap((s) => s.packages));
  }

  /** A service (or product) on sale by its address, with its packages on sale: its showroom page. Null when it's off sale, unknown or of the other kind. */
  async publicService(scope: TenantScope, slug: string, kind: OfferingKind): Promise<ServiceWithPackages | null> {
    const service = await this.store.serviceBySlug(scope, slug);
    if (!service || service.archivedAt || service.kind !== kind) return null;
    const category = await this.store.category(scope, service.categoryId);
    if (!category || category.archivedAt) return null;
    return { ...service, packages: (await this.store.packages(scope, { archived: false, serviceId: service.id })).sort(byPosition) };
  }

  /** Active or deactivated services, in the showroom's order. */
  async services(scope: TenantScope, archived = false): Promise<Service[]> {
    return (await this.store.services(scope, archived)).sort(byPosition);
  }

  async service(scope: TenantScope, id: string): Promise<Service | null> {
    return this.store.service(scope, id);
  }

  async package(scope: TenantScope, id: string): Promise<Offering | null> {
    return this.store.package(scope, id);
  }

  // --- Settings ----------------------------------------------------------------

  async settings(scope: TenantScope): Promise<ShowroomSettings> {
    return (await this.store.settings(scope)) ?? DEFAULT_SHOWROOM_SETTINGS;
  }

  async saveSettings(scope: TenantScope, settings: ShowroomSettings): Promise<ShowroomSettings> {
    await this.store.saveSettings(scope, settings);
    return settings;
  }

  // --- Categories --------------------------------------------------------------

  /** Adds a category of services or of products, unless an active one of that kind already has the name. */
  async createCategory(scope: TenantScope, kind: OfferingKind, name: string): Promise<SaveOutcome<Category>> {
    const duplicate = await this.duplicateCategory(scope, kind, name);
    if (duplicate) return { duplicateOf: duplicate };
    return { saved: await this.store.createCategory(scope, kind, name, null) };
  }

  /**
   * Adds one of Aming's product categories, with Aming's name, to pick its
   * products from. Unless a products category on sale already has that name
   * (added before, say).
   */
  async addAmingCategory(scope: TenantScope, source: { id: string; name: string }): Promise<SaveOutcome<Category>> {
    const duplicate = await this.duplicateCategory(scope, "product", source.name);
    if (duplicate) return { duplicateOf: duplicate };
    return { saved: await this.store.createCategory(scope, "product", source.name, source.id) };
  }

  async renameCategory(scope: TenantScope, id: string, name: string): Promise<SaveOutcome<Category>> {
    const category = await this.store.category(scope, id);
    if (!category) throw new OfferingError(CATEGORY_GONE);
    if (category.sourceCategoryId) throw new OfferingError("This category's name is Aming's.");
    const duplicate = await this.duplicateCategory(scope, category.kind, name, id);
    if (duplicate) return { duplicateOf: duplicate };
    const saved = await this.store.renameCategory(scope, id, name);
    if (!saved) throw new OfferingError(CATEGORY_GONE);
    return { saved };
  }

  /** Deactivates a category, taking its services off sale (they're kept), or reactivates it if its name is still free. */
  async setCategoryArchived(scope: TenantScope, id: string, archived: boolean): Promise<Category> {
    if (!archived) {
      const category = await this.store.category(scope, id);
      if (!category) throw new OfferingError(CATEGORY_GONE);
      if (await this.duplicateCategory(scope, category.kind, category.name, id)) {
        throw new OfferingError(`Another category is already called “${category.name}”. Rename one first.`);
      }
    }
    const saved = await this.store.setCategoryArchived(scope, id, archived);
    if (!saved) throw new OfferingError(CATEGORY_GONE);
    return saved;
  }

  // --- Services ----------------------------------------------------------------

  /** Adds a service (or, to a products category of its own, a product of its own) by name to an active category, unless one on sale already has the name. */
  async createService(scope: TenantScope, categoryId: string, name: string): Promise<SaveOutcome<Service>> {
    const category = await this.activeCategory(scope, categoryId);
    if (category.sourceCategoryId) throw new OfferingError(AMING_CATEGORY);
    const duplicate = await this.duplicateService(scope, name);
    if (duplicate) return { duplicateOf: duplicate };
    return { saved: await this.store.createService(scope, { name, description: null, slug: await this.newSlug(scope, name), categoryId, kind: category.kind, sourceProductId: null }) };
  }

  /**
   * Adds one of Aming's products to the active category added from its
   * category at Aming: Aming's
   * name and description, and its sizes (none: one, named after it), each
   * priced 0 ("Price on request") until the business sets its own prices.
   * Unless something on sale already has that name (picked before, say).
   */
  async pickFromAming(scope: TenantScope, categoryId: string, pick: AmingPick): Promise<SaveOutcome<Service>> {
    const category = await this.activeCategory(scope, categoryId);
    if (category.sourceCategoryId !== pick.categoryId) throw new OfferingError("Aming's products go in the category you added from theirs.");
    const duplicate = await this.duplicateService(scope, pick.name);
    if (duplicate) return { duplicateOf: duplicate };
    const product = await this.store.createService(scope, {
      name: pick.name,
      description: pick.description,
      slug: await this.newSlug(scope, pick.name),
      categoryId,
      kind: "product",
      sourceProductId: pick.productId,
    });
    // Package names are unique in a product ignoring case: the first of "8x12" and "8X12".
    const sizes = (pick.sizes.length ? pick.sizes : [pick.name]).filter((n, i, all) => all.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i);
    for (const name of sizes) await this.store.createPackage(scope, product.id, { name, description: null, price: 0, inclusions: [] });
    return { saved: product };
  }

  /** Of a product picked from Aming: which of Aming's photos and videos its page leaves out. */
  async setHiddenMedia(scope: TenantScope, id: string, hiddenMedia: string[]): Promise<Service> {
    const product = await this.store.service(scope, id);
    if (!product) throw new OfferingError(SERVICE_GONE);
    if (!product.sourceProductId) throw new OfferingError("Only a product from Aming shows Aming's photos.");
    return this.updateService(scope, id, { hiddenMedia: [...new Set(hiddenMedia)] });
  }

  /** Renames a service (its address stays), unless the name belongs to another one on sale. A product from Aming keeps Aming's name. */
  async renameService(scope: TenantScope, id: string, name: string): Promise<SaveOutcome<Service>> {
    const current = await this.store.service(scope, id);
    if (!current) throw new OfferingError(SERVICE_GONE);
    if (current.sourceProductId) throw new OfferingError(FROM_AMING);
    const duplicate = await this.duplicateService(scope, name, id);
    if (duplicate) return { duplicateOf: duplicate };
    return { saved: await this.updateService(scope, id, { name }) };
  }

  async setServiceDescription(scope: TenantScope, id: string, description: string | null): Promise<Service> {
    return this.updateService(scope, id, { description });
  }

  /** Moves a service to another active category (a product of the business's own to another of its own products categories). */
  async moveService(scope: TenantScope, id: string, categoryId: string): Promise<Service> {
    const [service, category] = await Promise.all([this.store.service(scope, id), this.activeCategory(scope, categoryId)]);
    if (!service) throw new OfferingError(SERVICE_GONE);
    if (service.kind !== category.kind) throw new OfferingError(service.kind === "product" ? "Move it to a products category." : "Move it to a services category.");
    if (service.sourceProductId) throw new OfferingError("A product from Aming stays in Aming's category.");
    if (category.sourceCategoryId) throw new OfferingError(AMING_CATEGORY);
    return this.updateService(scope, id, { categoryId });
  }

  /** Takes a service and its packages off sale (or puts it back, if its name is still free). */
  async setServiceArchived(scope: TenantScope, id: string, archived: boolean): Promise<Service> {
    if (!archived) {
      const service = await this.store.service(scope, id);
      if (!service) throw new OfferingError(SERVICE_GONE);
      if (await this.duplicateService(scope, service.name, id)) {
        throw new OfferingError(`Something on sale is already called “${service.name}”. Rename one first.`);
      }
    }
    const service = await this.store.setServiceArchived(scope, id, archived);
    if (!service) throw new OfferingError(SERVICE_GONE);
    return service;
  }

  // --- Packages ----------------------------------------------------------------

  /** Adds a package to a service on sale (a size to a product), unless it already has one by that name. A product from Aming has Aming's sizes only. */
  async createPackage(scope: TenantScope, serviceId: string, input: OfferingInput): Promise<SaveOutcome<Offering>> {
    const service = await this.store.service(scope, serviceId);
    if (!service) throw new OfferingError(SERVICE_GONE);
    if (service.archivedAt) throw new OfferingError(`This ${service.kind} is off sale. Put it back on sale first.`);
    if (service.sourceProductId) throw new OfferingError(FROM_AMING);
    const duplicate = await this.duplicatePackage(scope, serviceId, input.name);
    if (duplicate) return { duplicateOf: duplicate };
    return { saved: await this.store.createPackage(scope, serviceId, input) };
  }

  /** Changes a package, unless its new name belongs to another one on sale in its service. A size of a product from Aming keeps Aming's name. */
  async updatePackage(scope: TenantScope, id: string, input: OfferingInput): Promise<SaveOutcome<Offering>> {
    const current = await this.store.package(scope, id);
    if (!current) throw new OfferingError(PACKAGE_GONE);
    if (input.name !== current.name && (await this.store.service(scope, current.serviceId))?.sourceProductId) throw new OfferingError(FROM_AMING);
    const duplicate = await this.duplicatePackage(scope, current.serviceId, input.name, id);
    if (duplicate) return { duplicateOf: duplicate };
    const saved = await this.store.updatePackage(scope, id, input);
    if (!saved) throw new OfferingError(PACKAGE_GONE);
    return { saved };
  }

  /** Takes a package off sale (or puts it back, if its name is still free in its service). */
  async setPackageArchived(scope: TenantScope, id: string, archived: boolean): Promise<Offering> {
    if (!archived) {
      const current = await this.store.package(scope, id);
      if (!current) throw new OfferingError(PACKAGE_GONE);
      if (await this.duplicatePackage(scope, current.serviceId, current.name, id)) {
        throw new OfferingError(`${current.serviceName} already has a package called “${current.name}”. Rename one first.`);
      }
    }
    const saved = await this.store.setPackageArchived(scope, id, archived);
    if (!saved) throw new OfferingError(PACKAGE_GONE);
    return saved;
  }

  // --- Internals ---------------------------------------------------------------

  private async activeCategory(scope: TenantScope, id: string): Promise<Category> {
    const category = await this.store.category(scope, id);
    if (!category) throw new OfferingError(CATEGORY_GONE);
    if (category.archivedAt) throw new OfferingError("That category is inactive. Reactivate it first.");
    return category;
  }

  private async updateService(scope: TenantScope, id: string, patch: Parameters<OfferingStore["updateService"]>[2]): Promise<Service> {
    const saved = await this.store.updateService(scope, id, patch);
    if (!saved) throw new OfferingError(SERVICE_GONE);
    return saved;
  }

  private async newSlug(scope: TenantScope, name: string): Promise<string> {
    return uniqueSlug(serviceSlug(name), new Set(await this.store.serviceSlugs(scope)));
  }

  private async duplicateCategory(scope: TenantScope, kind: OfferingKind, name: string, self?: string): Promise<Category | null> {
    const existing = await this.store.findActiveCategory(scope, kind, name);
    return existing && existing.id !== self ? existing : null;
  }

  private async duplicateService(scope: TenantScope, name: string, self?: string): Promise<Service | null> {
    const existing = await this.store.findActiveService(scope, name);
    return existing && existing.id !== self ? existing : null;
  }

  private async duplicatePackage(scope: TenantScope, serviceId: string, name: string, self?: string): Promise<Offering | null> {
    const existing = await this.store.findActivePackage(scope, serviceId, name);
    return existing && existing.id !== self ? existing : null;
  }
}

/** Categories in order, each with its services in order, each with its packages in order. */
function group(categories: Category[], services: Service[], packages: Offering[]): CategoryWithServices[] {
  return [...categories].sort(byPosition).map((c) => ({
    ...c,
    services: services
      .filter((s) => s.categoryId === c.id)
      .sort(byPosition)
      .map((s) => ({ ...s, packages: packages.filter((p) => p.serviceId === s.id).sort(byPosition) })),
  }));
}
