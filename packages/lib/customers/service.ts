// Customer use cases over a CustomerStore. No database or framework code, so
// it runs on any store (tests use an in-memory one, ./service.test.ts).
// Callers find the tenant from the session and parse the input first.

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Customer, CustomerInput, SaveOutcome } from "./core";
import { CustomerError, type CustomerStore } from "./ports";

const GONE = "That client no longer exists.";

export class CustomerService {
  constructor(private readonly store: CustomerStore) {}

  /** Active customers (or archived ones), by name. */
  async list(scope: TenantScope, archived = false): Promise<Customer[]> {
    return (await this.store.list(scope, archived)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(scope: TenantScope, id: string): Promise<Customer | null> {
    return this.store.get(scope, id);
  }

  /** Saves a new customer, unless one in this tenant already has the phone number. */
  async create(scope: TenantScope, input: CustomerInput): Promise<SaveOutcome> {
    const duplicate = await this.duplicateOf(scope, input.phone);
    if (duplicate) return { duplicateOf: duplicate };
    return { saved: await this.store.create(scope, input) };
  }

  /** Changes a customer, unless their new phone number belongs to another customer. */
  async update(scope: TenantScope, id: string, input: CustomerInput): Promise<SaveOutcome> {
    const duplicate = await this.duplicateOf(scope, input.phone, id);
    if (duplicate) return { duplicateOf: duplicate };
    const saved = await this.store.update(scope, id, input);
    if (!saved) throw new CustomerError(GONE);
    return { saved };
  }

  /** Hides a customer from everyday lists (or brings them back). Their history stays. */
  async setArchived(scope: TenantScope, id: string, archived: boolean): Promise<Customer> {
    const customer = await this.store.setArchived(scope, id, archived);
    if (!customer) throw new CustomerError(GONE);
    return customer;
  }

  private async duplicateOf(scope: TenantScope, phone: string | null, self?: string): Promise<Customer | null> {
    if (!phone) return null;
    const existing = await this.store.findByPhone(scope, phone);
    return existing && existing.id !== self ? existing : null;
  }
}
