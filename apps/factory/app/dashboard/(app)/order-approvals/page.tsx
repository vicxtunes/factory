import { redirect } from "next/navigation";

import { CardGridSkeleton, ChipRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { agentPaymentsFor } from "@repo/lib/agents/server";
import { getDashboardSession } from "@repo/lib/auth/session";
import { fetchApprovalQueueItems, fetchDesigners, fetchProductCatalog } from "@repo/lib/queries";
import { isPhotobookCategory } from "@repo/lib/orders/photobook";
import { Costing } from "@repo/lib/production/core";
import { canManageProduction } from "@repo/lib/production/policy";
import { production } from "@repo/lib/production/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { canManageBusiness, isManagerRole } from "@repo/lib/types";

import { OrderApprovalQueue, type ItemCosts } from "../../order-approval-queue";

export const metadata = { title: "Client Orders — Factory Order Tracker" };

export default async function OrderApprovalsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  return (
    <Loading
      skeleton={
        <>
          <ChipRowSkeleton count={3} />
          <CardGridSkeleton />
        </>
      }
    >
      <Queue canCancel={session.role === "boss"} seesCosts={canManageProduction(session.role)} takesPayments={canManageBusiness(session.role)} />
    </Loading>
  );
}

async function Queue({ canCancel, seesCosts, takesPayments }: { canCancel: boolean; seesCosts: boolean; takesPayments: boolean }) {
  const [items, designers, catalog] = await Promise.all([
    fetchApprovalQueueItems(),
    fetchDesigners(true),
    fetchProductCatalog(),
  ]);
  const photobookCategoryIds = catalog.filter((c) => isPhotobookCategory(c.name)).map((c) => c.id);
  const agentPayments = await agentPaymentsFor([...new Set(items.map((i) => i.order_id))]);
  return (
    <OrderApprovalQueue
      items={items}
      designers={designers}
      photobookCategoryIds={photobookCategoryIds}
      agentPayments={agentPayments}
      costs={seesCosts ? await itemCosts(items) : null}
      driveLinks={await driveLinkCounts(items.map((i) => i.id))}
      canCancel={canCancel}
      takesPayments={takesPayments}
    />
  );
}

/** How many Drive folders and files each item has linked (the table is the server's own, like the Drive). */
async function driveLinkCounts(itemIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data, error } = await createAdminClient().from("order_item_drive_links").select("order_item_id").in("order_item_id", itemIds.slice(i, i + 200));
    if (error) throw new Error(`order approvals: drive links: ${error.message}`);
    for (const r of data ?? []) out[r.order_item_id as string] = (out[r.order_item_id as string] ?? 0) + 1;
  }
  return out;
}

/** Each item's cost of one from its product's recipe (with its add-ons), at today's costs; items with no recipe left out. */
async function itemCosts(items: Awaited<ReturnType<typeof fetchApprovalQueueItems>>): Promise<ItemCosts> {
  const costing = new Costing(await production.costBook(await resolveTenantScope()));
  const out: ItemCosts = {};
  for (const item of items) {
    if (!item.product_id || !costing.hasRecipe(item.product_id)) continue;
    const q = costing.quote(item.product_id, { variantId: item.variant_id, variantName: item.product_type, details: item.attributes ?? {} });
    out[item.id] = { cost: q.cost, short: q.missing.length > 0 };
  }
  return out;
}
