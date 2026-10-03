// What a host app must provide to store customers. This app's implementation
// is ./adapters/supabase/store.ts.
//
// Every method takes the tenant's scope and must only ever see that tenant's
// customers: an id from another tenant behaves exactly like one that doesn't
// exist.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Customer, CustomerInput } from "./core/model";

export interface CustomerStore {
  /** Active customers, or archived ones. */
  list(scope: TenantScope, archived: boolean): Promise<Customer[]>;
  get(scope: TenantScope, id: string): Promise<Customer | null>;
  findByPhone(scope: TenantScope, phone: string): Promise<Customer | null>;
  create(scope: TenantScope, input: CustomerInput): Promise<Customer>;
  /** Null when there is no such customer in this tenant. */
  update(scope: TenantScope, id: string, input: CustomerInput): Promise<Customer | null>;
  /** Archives (now) or restores. Null when there is no such customer in this tenant. */
  setArchived(scope: TenantScope, id: string, archived: boolean): Promise<Customer | null>;
}

/** A problem the person should see (the message is safe to show). */
export class CustomerError extends AppError {}
