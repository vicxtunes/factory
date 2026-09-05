import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardSession } from "@/lib/auth/session";
import { fetchAllItems } from "@/lib/queries";
import type { Worker } from "@/lib/types";

import { OrderBoard } from "../../order-board";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await getDashboardSession();
  const isSupervisor = session?.role === "supervisor";

  const admin = createAdminClient();
  const [items, workersRes] = await Promise.all([
    fetchAllItems(),
    admin
      .from("workers")
      .select("id, name, station, active, created_at")
      .eq("active", true)
      .order("name"),
  ]);

  const activeWorkers = (workersRes.data ?? []) as Omit<Worker, "pin_hash">[];

  return (
    <OrderBoard items={items} workers={activeWorkers} canManage={isSupervisor} />
  );
}
