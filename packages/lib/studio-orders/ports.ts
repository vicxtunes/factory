// What a host app must provide for studio orders. This app's implementation
// is ./adapters/supabase/store.ts (Aming's orders).
//
// Every method takes the studio's scope and sees only that studio's links.
// Orders have no tenant of their own: an order belongs to a studio when the
// studio's owner placed it, and only such orders can be linked.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { LinkedOrder, OrderChoice } from "./core/model";

export interface StudioOrderStore {
  /** The orders linked to one project, or (no projectId) to any of the studio's projects. */
  linked(scope: TenantScope, projectId?: string): Promise<LinkedOrder[]>;
  /** The owner's recent orders that aren't cancelled or linked to a project yet. */
  unlinked(scope: TenantScope, ownerClientId: string): Promise<OrderChoice[]>;
  /**
   * Links an order to a project. Throws StudioOrderError unless the studio's
   * owner placed the order and the project is the studio's; linking it to a
   * second project is refused, to the same one is a no-op.
   */
  link(scope: TenantScope, projectId: string, orderId: string): Promise<void>;
  /** False when that order isn't linked to that project in this studio. */
  unlink(scope: TenantScope, projectId: string, orderId: string): Promise<boolean>;
}

/** A problem the person should see (the message is safe to show). */
export class StudioOrderError extends AppError {}
