// Offering use cases over an OfferingStore, the way Aming manages products:
// categories holding services, each with its packages, and the showroom's
// settings. No database or framework code, so it runs on any store (tests
// use an in-memory one, ./service.test.ts). Callers find the tenant from the
// session and parse the input first.

import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  DEFAULT_SHOWROOM_SETTINGS,
  serviceSlug,
  uniqueSlug,
  type Category,
  type CategoryWithServices,
  type Offering,
  type OfferingInput,
  type SaveOutcome,
  type Service,
  type ServiceWithPackages,
  type ShowroomSettings,
} from "./core";
import { OfferingError, type OfferingStore } from "./ports";

const CATEGORY_GONE = "That category no longer exists.";
const SERVICE_GONE = "That service no longer exists.";
const PACKAGE_GONE = "That package no longer exists.";

const byPosition = <T extends { position: number; name: string }>(a: T, b: T) =>
  a.position - b.position || a.name.localeCompare(b.name);

export class OfferingService {
  constructor(private readonly store: OfferingStore) {}

  // --- Reading -----------------------------------------------------------------

  /**
   * Everything, for managing it: every category (deactivated ones too) with
   * every service and package, deactivated ones included, in order.
   */
  async manage(scope: TenantScope): Promise<CategoryWithServices[]> {
    const [categories, services, packages] = await Promise.all([
      this.store.categories(scope),
      Promise.all([this.store.services(scope, false), this.store.services(scope, true)]).then((l) => l.flat()),
      Promise.all([this.store.packages(scope, { archived: false }), this.store.packages(scope, { archived: true })]).then((l) => l.flat()),
    ]);
    return group(categories, services, packages);
  }

  /** The showroom: active categories with their services on sale (and those services' packages on sale), empty ones left out. */
  async showroom(scope: TenantScope): Promise<CategoryWithServices[]> {
    const [categories, services, packages] = await Promise.all([
      this.store.categories(scope),
      this.store.services(scope, false),
      this.store.packages(scope, { archived: false }),
    ]);
    return group(categories.filter((c) => !c.archivedAt), services, packages).filter((c) => c.services.length > 0);
  }

  /** The services on sale, in the showroom's order, each with its packages on sale. */
  async catalog(scope: TenantScope): Promise<ServiceWithPackages[]> {
    return (await this.showroom(scope)).flatMap((c) => c.services);
  }

  /** Every package on sale (its service and category on sale too), by service then tier: what quotations, invoices and bookings pick from. */
  async onSale(scope: TenantScope): Promise<Offering[]> {
    return (await this.catalog(scope)).flatMap((s) => s.packages);
  }

  /** A service on sale by its address, with its packages on sale: its showroom page. Null when it's off sale or unknown. */
  async publicService(scope: TenantScope, slug: string): Promise<ServiceWithPackages | null> {
    const service = await this.store.serviceBySlug(scope, slug);
    if (!service || service.archivedAt) return null;
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

  /** Adds a category, unless an active one already has the name. */
  async createCategory(scope: TenantScope, name: string): Promise<SaveOutcome<Category>> {
    const duplicate = await this.duplicateCategory(scope, name);
    if (duplicate) return { duplicateOf: duplicate };
    return { saved: await this.store.createCategory(scope, name) };
  }

  async renameCategory(scope: TenantScope, id: string, name: string): Promise<SaveOutcome<Category>> {
    const duplicate = await this.duplicateCategory(scope, name, id);
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
      if (await this.duplicateCategory(scope, category.name, id)) {
        throw new OfferingError(`Another category is already called “${category.name}”. Rename one first.`);
      }
    }
    const saved = await this.store.setCategoryArchived(scope, id, archived);
    if (!saved) throw new OfferingError(CATEGORY_GONE);
    return saved;
  }

  // --- Services ----------------------------------------------------------------

  /** Adds a service by name to an active category, unless one on sale already has the name. */
  async createService(scope: TenantScope, categoryId: string, name: string): Promise<SaveOutcome<Service>> {
    await this.activeCategory(scope, categoryId);
    const duplicate = await this.duplicateService(scope, name);
    if (duplicate) return { duplicateOf: duplicate };
    const slug = uniqueSlug(serviceSlug(name), new Set(await this.store.serviceSlugs(scope)));
    return { saved: await this.store.createService(scope, { name, description: null, slug, categoryId }) };
  }

  /** Renames a service (its address stays), unless the name belongs to another one on sale. */
  async renameService(scope: TenantScope, id: string, name: string): Promise<SaveOutcome<Service>> {
    const duplicate = await this.duplicateService(scope, name, id);
    if (duplicate) return { duplicateOf: duplicate };
    return { saved: await this.updateService(scope, id, { name }) };
  }

  async setServiceDescription(scope: TenantScope, id: string, description: string | null): Promise<Service> {
    return this.updateService(scope, id, { description });
  }

  /** Moves a service to another active category. */
  async moveService(scope: TenantScope, id: string, categoryId: string): Promise<Service> {
    await this.activeCategory(scope, categoryId);
    return this.updateService(scope, id, { categoryId });
  }

  /** Takes a service and its packages off sale (or puts it back, if its name is still free). */
  async setServiceArchived(scope: TenantScope, id: string, archived: boolean): Promise<Service> {
    if (!archived) {
      const service = await this.store.service(scope, id);
      if (!service) throw new OfferingError(SERVICE_GONE);
      if (await this.duplicateService(scope, service.name, id)) {
        throw new OfferingError(`Another service is already called “${service.name}”. Rename one first.`);
      }
    }
    const service = await this.store.setServiceArchived(scope, id, archived);
    if (!service) throw new OfferingError(SERVICE_GONE);
    return service;
  }

  // --- Packages ----------------------------------------------------------------

  /** Adds a package to a service on sale, unless the service already has one by that name. */
  async createPackage(scope: TenantScope, serviceId: string, input: OfferingInput): Promise<SaveOutcome<Offering>> {
    const service = await this.store.service(scope, serviceId);
    if (!service) throw new OfferingError(SERVICE_GONE);
    if (service.archivedAt) throw new OfferingError("This service is off sale. Put it back on sale first.");
    const duplicate = await this.duplicatePackage(scope, serviceId, input.name);
    if (duplicate) return { duplicateOf: duplicate };
    return { saved: await this.store.createPackage(scope, serviceId, input) };
  }

  /** Changes a package, unless its new name belongs to another one on sale in its service. */
  async updatePackage(scope: TenantScope, id: string, input: OfferingInput): Promise<SaveOutcome<Offering>> {
    const current = await this.store.package(scope, id);
    if (!current) throw new OfferingError(PACKAGE_GONE);
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

  private async duplicateCategory(scope: TenantScope, name: string, self?: string): Promise<Category | null> {
    const existing = await this.store.findActiveCategory(scope, name);
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
