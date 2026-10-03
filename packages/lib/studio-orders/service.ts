// Studio-order use cases over a StudioOrderStore. No database or framework
// code (./service.test.ts). Callers find the studio (and its owner) from the
// session and parse the input first.

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { LinkedOrder, OrderChoice } from "./core";
import { StudioOrderError, type StudioOrderStore } from "./ports";

/** Still in hand first, then newest. */
const byUrgency = (a: LinkedOrder, b: LinkedOrder) =>
  Number(a.finished || a.cancelled) - Number(b.finished || b.cancelled) || b.placedAt.localeCompare(a.placedAt);

export class StudioOrderService {
  constructor(private readonly store: StudioOrderStore) {}

  /** A project's Aming orders: still in hand first. */
  async forProject(scope: TenantScope, projectId: string): Promise<LinkedOrder[]> {
    return (await this.store.linked(scope, projectId)).sort(byUrgency);
  }

  /** Every Aming order across the studio's projects. */
  async forStudio(scope: TenantScope): Promise<LinkedOrder[]> {
    return (await this.store.linked(scope)).sort(byUrgency);
  }

  /** What "Link an existing order" offers: the owner's recent orders not linked yet, newest first. */
  async choices(scope: TenantScope, ownerClientId: string): Promise<OrderChoice[]> {
    return (await this.store.unlinked(scope, ownerClientId)).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  }

  async link(scope: TenantScope, projectId: string, orderId: string): Promise<void> {
    await this.store.link(scope, projectId, orderId);
  }

  /** Takes the order off the project. The order itself is untouched. */
  async unlink(scope: TenantScope, projectId: string, orderId: string): Promise<void> {
    if (!(await this.store.unlink(scope, projectId, orderId))) throw new StudioOrderError("That order isn't linked to this project.");
  }
}
