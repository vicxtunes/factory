import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardSession } from "@/lib/auth/session";
import { fetchAllItems, fetchCategoryNames } from "@/lib/queries";
import { isManagerRole, type Worker } from "@/lib/types";

import { OrderBoard } from "../../order-board";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await getDashboardSession();
  const canManage = session ? isManagerRole(session.role) : false;

  const admin = createAdminClient();
  const [items, workersRes, categories] = await Promise.all([
    fetchAllItems(),
    admin
      .from("workers")
      .select("id, name, station, active, created_at")
      .eq("active", true)
      .order("name"),
    fetchCategoryNames(),
  ]);

  const activeWorkers = (workersRes.data ?? []) as Omit<Worker, "pin_hash">[];

  return (
    <OrderBoard
      items={items}
      workers={activeWorkers}
      categories={categories}
      canManage={canManage}
    />
  );
}
