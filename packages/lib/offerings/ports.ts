// What a host app must provide to store offerings. This app's implementation
// is ./adapters/supabase/store.ts.
//
// Every method takes the tenant's scope and must only ever see that tenant's
// offerings: an id from another tenant behaves like one that doesn't exist.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Offering, OfferingInput } from "./core/model";

export interface OfferingStore {
  /** On-sale offerings, or archived ones. */
  list(scope: TenantScope, archived: boolean): Promise<Offering[]>;
  get(scope: TenantScope, id: string): Promise<Offering | null>;
  /** The on-sale offering with this name, ignoring case. */
  findActiveByName(scope: TenantScope, name: string): Promise<Offering | null>;
  create(scope: TenantScope, input: OfferingInput): Promise<Offering>;
  /** Null when there is no such offering in this tenant. */
  update(scope: TenantScope, id: string, input: OfferingInput): Promise<Offering | null>;
  /** Archives (now) or restores. Null when there is no such offering in this tenant. */
  setArchived(scope: TenantScope, id: string, archived: boolean): Promise<Offering | null>;
}

/** A problem the person should see (the message is safe to show). */
export class OfferingError extends AppError {}
