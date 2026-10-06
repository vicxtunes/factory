// Offering use cases over an OfferingStore: services and their packages. No
// database or framework code, so it runs on any store (tests use an
// in-memory one, ./service.test.ts). Callers find the tenant from the
// session and parse the input first.

import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  serviceSlug,
  uniqueSlug,
  type Offering,
  type OfferingInput,
  type OfferingSaveOutcome,
  type Service,
  type ServiceInput,
  type ServiceSaveOutcome,
  type ServiceWithPackages,
} from "./core";
import { OfferingError, type OfferingStore } from "./ports";

const SERVICE_GONE = "That service no longer exists.";
const PACKAGE_GONE = "That package no longer exists.";

const byPosition = <T extends { position: number; name: string }>(a: T, b: T) =>
  a.position - b.position || a.name.localeCompare(b.name);

export class OfferingService {
  constructor(private readonly store: OfferingStore) {}

  // --- Services --------------------------------------------------------------

  /** In the showroom's order. */
  async services(scope: TenantScope, archived = false): Promise<Service[]> {
    return (await this.store.services(scope, archived)).sort(byPosition);
  }

  async service(scope: TenantScope, id: string): Promise<Service | null> {
    return this.store.service(scope, id);
  }

  /** The services on sale, each with its packages on sale, in the showroom's order. */
  async catalog(scope: TenantScope): Promise<ServiceWithPackages[]> {
    const [services, packages] = await Promise.all([this.services(scope), this.store.packages(scope, { archived: false })]);
    return services.map((s) => ({ ...s, packages: packages.filter((p) => p.serviceId === s.id).sort(byPosition) }));
  }

  /** A service on sale by its address, with its packages on sale: its showroom page. Null when it's archived or unknown. */
  async publicService(scope: TenantScope, slug: string): Promise<ServiceWithPackages | null> {
    const service = await this.store.serviceBySlug(scope, slug);
    if (!service || service.archivedAt) return null;
    return { ...service, packages: await this.packages(scope, service.id) };
  }

  /** Saves a new service, unless one on sale already has the name. */
  async createService(scope: TenantScope, input: ServiceInput): Promise<ServiceSaveOutcome> {
    const duplicate = await this.duplicateService(scope, input.name);
    if (duplicate) return { duplicateOf: duplicate };
    const slug = uniqueSlug(serviceSlug(input.name), new Set(await this.store.serviceSlugs(scope)));
    return { saved: await this.store.createService(scope, { ...input, slug }) };
  }

  /** Changes a service (its address stays), unless its new name belongs to another one on sale. */
  async updateService(scope: TenantScope, id: string, input: ServiceInput): Promise<ServiceSaveOutcome> {
    const duplicate = await this.duplicateService(scope, input.name, id);
    if (duplicate) return { duplicateOf: duplicate };
    const saved = await this.store.updateService(scope, id, input);
    if (!saved) throw new OfferingError(SERVICE_GONE);
    return { saved };
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

  // --- Packages --------------------------------------------------------------

  /** A service's packages, in their order. */
  async packages(scope: TenantScope, serviceId: string, archived = false): Promise<Offering[]> {
    return (await this.store.packages(scope, { archived, serviceId })).sort(byPosition);
  }

  /** Every package on sale (its service on sale too), by service then tier: what quotations, invoices and bookings pick from. */
  async onSale(scope: TenantScope): Promise<Offering[]> {
    return (await this.catalog(scope)).flatMap((s) => s.packages);
  }

  async package(scope: TenantScope, id: string): Promise<Offering | null> {
    return this.store.package(scope, id);
  }

  /** Adds a package to a service on sale, unless the service already has one by that name. */
  async createPackage(scope: TenantScope, serviceId: string, input: OfferingInput): Promise<OfferingSaveOutcome> {
    const service = await this.store.service(scope, serviceId);
    if (!service) throw new OfferingError(SERVICE_GONE);
    if (service.archivedAt) throw new OfferingError("This service is archived. Put it back on sale first.");
    const duplicate = await this.duplicatePackage(scope, serviceId, input.name);
    if (duplicate) return { duplicateOf: duplicate };
    return { saved: await this.store.createPackage(scope, serviceId, input) };
  }

  /** Changes a package, unless its new name belongs to another one on sale in its service. */
  async updatePackage(scope: TenantScope, id: string, input: OfferingInput): Promise<OfferingSaveOutcome> {
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

  private async duplicateService(scope: TenantScope, name: string, self?: string): Promise<Service | null> {
    const existing = await this.store.findActiveService(scope, name);
    return existing && existing.id !== self ? existing : null;
  }

  private async duplicatePackage(scope: TenantScope, serviceId: string, name: string, self?: string): Promise<Offering | null> {
    const existing = await this.store.findActivePackage(scope, serviceId, name);
    return existing && existing.id !== self ? existing : null;
  }
}
