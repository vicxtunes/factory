// Offering use cases over an OfferingStore. No database or framework code, so
// it runs on any store (tests use an in-memory one, ./service.test.ts).
// Callers find the tenant from the session and parse the input first.

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Offering, OfferingInput, OfferingSaveOutcome } from "./core";
import { OfferingError, type OfferingStore } from "./ports";

const GONE = "That package or service no longer exists.";

export class OfferingService {
  constructor(private readonly store: OfferingStore) {}

  /** Packages first, then services; by name within each. */
  async list(scope: TenantScope, archived = false): Promise<Offering[]> {
    return (await this.store.list(scope, archived)).sort(
      (a, b) => (a.kind === b.kind ? 0 : a.kind === "package" ? -1 : 1) || a.name.localeCompare(b.name),
    );
  }

  async get(scope: TenantScope, id: string): Promise<Offering | null> {
    return this.store.get(scope, id);
  }

  /** Saves a new offering, unless one on sale already has the name. */
  async create(scope: TenantScope, input: OfferingInput): Promise<OfferingSaveOutcome> {
    const duplicate = await this.duplicateOf(scope, input.name);
    if (duplicate) return { duplicateOf: duplicate };
    return { saved: await this.store.create(scope, input) };
  }

  /** Changes an offering, unless its new name belongs to another one on sale. */
  async update(scope: TenantScope, id: string, input: OfferingInput): Promise<OfferingSaveOutcome> {
    const duplicate = await this.duplicateOf(scope, input.name, id);
    if (duplicate) return { duplicateOf: duplicate };
    const saved = await this.store.update(scope, id, input);
    if (!saved) throw new OfferingError(GONE);
    return { saved };
  }

  /** Takes an offering off sale (or puts it back, if its name is still free). */
  async setArchived(scope: TenantScope, id: string, archived: boolean): Promise<Offering> {
    if (!archived) {
      const offering = await this.store.get(scope, id);
      if (!offering) throw new OfferingError(GONE);
      if (await this.duplicateOf(scope, offering.name, id)) {
        throw new OfferingError(`Another package or service is already called “${offering.name}”. Rename one first.`);
      }
    }
    const offering = await this.store.setArchived(scope, id, archived);
    if (!offering) throw new OfferingError(GONE);
    return offering;
  }

  private async duplicateOf(scope: TenantScope, name: string, self?: string): Promise<Offering | null> {
    const existing = await this.store.findActiveByName(scope, name);
    return existing && existing.id !== self ? existing : null;
  }
}
