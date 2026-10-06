// What a host app must provide to store services and their packages. This
// app's implementation is ./adapters/supabase/store.ts.
//
// Every method takes the tenant's scope and must only ever see that tenant's
// rows: an id from another tenant behaves like one that doesn't exist.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Category, Offering, OfferingInput, OfferingKind, Service, ServiceInput, ShowroomSettings } from "./core/model";

export interface OfferingStore {
  /** Every category, active and deactivated. */
  categories(scope: TenantScope): Promise<Category[]>;
  category(scope: TenantScope, id: string): Promise<Category | null>;
  /** The active category of this kind with this name, ignoring case. */
  findActiveCategory(scope: TenantScope, kind: OfferingKind, name: string): Promise<Category | null>;
  /** Saves a new category last in the showroom's order. */
  createCategory(scope: TenantScope, kind: OfferingKind, name: string): Promise<Category>;
  /** Null when there is no such category in this tenant. */
  renameCategory(scope: TenantScope, id: string, name: string): Promise<Category | null>;
  /** Deactivates (now) or reactivates. Null when there is no such category in this tenant. */
  setCategoryArchived(scope: TenantScope, id: string, archived: boolean): Promise<Category | null>;

  /** On-sale services and products, or archived ones. */
  services(scope: TenantScope, archived: boolean): Promise<Service[]>;
  service(scope: TenantScope, id: string): Promise<Service | null>;
  serviceBySlug(scope: TenantScope, slug: string): Promise<Service | null>;
  /** The on-sale service with this name, ignoring case. */
  findActiveService(scope: TenantScope, name: string): Promise<Service | null>;
  /** Every slug the tenant's services use, archived ones included. */
  serviceSlugs(scope: TenantScope): Promise<string[]>;
  /** Saves a new service or product (its category's kind) last in the showroom's order. */
  createService(
    scope: TenantScope,
    input: ServiceInput & { slug: string; categoryId: string; kind: OfferingKind; sourceProductId: string | null },
  ): Promise<Service>;
  /** Changes what's given (name, description, category, media left out). Null when there is no such service in this tenant. */
  updateService(
    scope: TenantScope,
    id: string,
    patch: Partial<ServiceInput & { categoryId: string; hiddenMedia: string[] }>,
  ): Promise<Service | null>;
  /** Archives (now) or restores. Null when there is no such service in this tenant. */
  setServiceArchived(scope: TenantScope, id: string, archived: boolean): Promise<Service | null>;

  /** Packages, on sale or archived, of every service or of one. */
  packages(scope: TenantScope, filter: { archived: boolean; serviceId?: string }): Promise<Offering[]>;
  package(scope: TenantScope, id: string): Promise<Offering | null>;
  /** The service's on-sale package with this name, ignoring case. */
  findActivePackage(scope: TenantScope, serviceId: string, name: string): Promise<Offering | null>;
  /** Saves a new package last in its service. */
  createPackage(scope: TenantScope, serviceId: string, input: OfferingInput): Promise<Offering>;
  /** Null when there is no such package in this tenant. */
  updatePackage(scope: TenantScope, id: string, input: OfferingInput): Promise<Offering | null>;
  /** Archives (now) or restores. Null when there is no such package in this tenant. */
  setPackageArchived(scope: TenantScope, id: string, archived: boolean): Promise<Offering | null>;

  /** The tenant's showroom settings, or null when it has never saved any (the defaults apply). */
  settings(scope: TenantScope): Promise<ShowroomSettings | null>;
  saveSettings(scope: TenantScope, settings: ShowroomSettings): Promise<void>;
}

/** A problem the person should see (the message is safe to show). */
export class OfferingError extends AppError {}
