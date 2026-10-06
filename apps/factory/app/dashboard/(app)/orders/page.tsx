import { Skeleton } from "@repo/ui/Skeleton";
import { Loading } from "@repo/ui/skeletons/Loading";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { getDashboardSession } from "@repo/lib/auth/session";
import {
  fetchAgents,
  fetchCategoryNames,
  fetchClients,
  fetchDesigners,
  fetchOfficeItems,
  fetchProductCatalog,
} from "@repo/lib/queries";
import { canViewOrderAudit, isManagerRole, type Worker } from "@repo/lib/types";

import { OrderBoard } from "../../order-board";

export default async function OrdersPage() {
  const session = await getDashboardSession();
  const canManage = session ? isManagerRole(session.role) : false;
  const canViewAudit = session ? canViewOrderAudit(session.role) : false;
  const canCancel = session?.role === "boss";

  return (
    <Loading
      // OrderBoard's default "cards" view: a toolbar (search, filter chips, view toggle) above a card grid.
      skeleton={
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-11 w-56" />
            <Skeleton className="h-11 w-24" />
            <Skeleton className="h-11 w-24" />
            <Skeleton className="h-11 w-24" />
            <div className="ml-auto flex gap-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        </div>
      }
    >
      <Board canManage={canManage} canViewAudit={canViewAudit} canCancel={canCancel} />
    </Loading>
  );
}

async function Board({ canManage, canViewAudit, canCancel }: { canManage: boolean; canViewAudit: boolean; canCancel: boolean }) {
  const admin = createAdminClient();
  const [items, workersRes, categories, catalog, clients, agents, designers] = await Promise.all([
    fetchOfficeItems(),
    admin
      .from("workers")
      .select("id, name, station, active, created_at")
      .eq("active", true)
      .order("name"),
    fetchCategoryNames(),
    fetchProductCatalog(true),
    fetchClients(true),
    fetchAgents(true),
    fetchDesigners(true),
  ]);

  const activeWorkers = (workersRes.data ?? []) as Omit<Worker, "pin_hash">[];

  return (
    <OrderBoard
      items={items}
      workers={activeWorkers}
      categories={categories}
      canManage={canManage}
      canViewAudit={canViewAudit}
      canCancel={canCancel}
      catalog={catalog}
      clients={clients}
      agents={agents}
      designers={designers}
    />
  );
}
