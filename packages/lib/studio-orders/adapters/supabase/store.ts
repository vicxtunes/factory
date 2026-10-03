import "server-only";

// This app's StudioOrderStore: Aming's orders (orders, order_items) and the
// project_orders links (supabase/migrations/20261003180000_project_orders.sql).
// Service-role client, so every link query filters by the studio's tenant and
// the owner's orders by their client id; studio_link_order() re-checks both.
//
// Progress words come from ../../progress.ts.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { LinkedOrder, OrderChoice } from "../../core/model";
import { StudioOrderError, type StudioOrderStore } from "../../ports";
import { toLinked, type LinkRow } from "../../progress";

const ORDER = "id, order_no, created_at, delivery_date, cancelled_at, items:order_items (product, qty, production_status, stage, assigned_worker_id)";
const LINK = `project:projects!project_orders_tenant_id_project_id_fkey (id, title), order:orders (${ORDER})`;

const ERRORS: Record<string, string> = {
  "STUDIO_ORDERS:not_your_order": "That order isn't one of yours.",
  "STUDIO_ORDERS:project_not_found": "That project no longer exists.",
  "STUDIO_ORDERS:linked_elsewhere": "That order is already linked to another project.",
};

function fail(what: string, error: { code?: string; message: string }): never {
  const known = Object.keys(ERRORS).find((code) => error.message.includes(code));
  if (known) throw new StudioOrderError(ERRORS[known]);
  // Linked to two projects at once: the unique key on order_id caught it.
  if (error.code === "23505") throw new StudioOrderError(ERRORS["STUDIO_ORDERS:linked_elsewhere"]);
  throw new Error(`studio-orders: could not ${what}: ${error.message}`);
}

export const supabaseStudioOrderStore: StudioOrderStore = {
  async linked(scope, projectId) {
    let query = createAdminClient().from("project_orders").select(LINK).eq("tenant_id", scope.tenantId);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query.returns<LinkRow[]>();
    if (error) fail("load the project's orders", error);
    return data.map(toLinked).filter((o): o is LinkedOrder => o !== null);
  },

  async unlinked(_scope, ownerClientId) {
    const { data, error } = await createAdminClient()
      .from("orders")
      .select("id, order_no, created_at, items:order_items (product, qty), links:project_orders (id)")
      .eq("client_id", ownerClientId)
      .is("cancelled_at", null)
      .order("created_at", { ascending: false })
      .limit(30)
      // order_id is unique in project_orders, so each order has at most one link: an object or null.
      .returns<{ id: string; order_no: string; created_at: string; items: { product: string; qty: number }[]; links: { id: string } | null }[]>();
    if (error) fail("load your orders", error);
    return data
      .filter((o) => o.links === null)
      .map(
        (o): OrderChoice => ({
          orderId: o.id,
          orderNo: o.order_no,
          placedAt: o.created_at,
          summary: o.items.map((i) => (i.qty > 1 ? `${i.qty} × ${i.product}` : i.product)).join(", "),
        }),
      );
  },

  async link(scope, projectId, orderId) {
    const { error } = await createAdminClient().rpc("studio_link_order", { p_tenant: scope.tenantId, p_project: projectId, p_order: orderId });
    if (error) fail("link the order", error);
  },

  async unlink(scope, projectId, orderId) {
    const { data, error } = await createAdminClient()
      .from("project_orders")
      .delete()
      .eq("tenant_id", scope.tenantId)
      .eq("project_id", projectId)
      .eq("order_id", orderId)
      .select("id");
    if (error) fail("unlink the order", error);
    return data.length === 1;
  },
};
