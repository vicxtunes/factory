import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardSession } from "@/lib/auth/session";
import { isManagerRole, type Station, type Worker } from "@/lib/types";

import { StationPanel } from "../../station-panel";
import { WorkerPanel } from "../../worker-panel";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const admin = createAdminClient();
  const [workersRes, stationsRes] = await Promise.all([
    admin
      .from("workers")
      .select("id, name, station, active, created_at")
      .order("name"),
    admin.from("stations").select("id, name, created_at").order("name"),
  ]);

  const workers = (workersRes.data ?? []) as Omit<Worker, "pin_hash">[];
  const stations = (stationsRes.data ?? []) as Station[];
  const canManageStations = session.role === "boss";

  return (
    <div className="space-y-8">
      <section>
        <SectionLabel>Stations</SectionLabel>
        {!canManageStations ? (
          <p className="mb-3 text-sm text-muted">
            View only — stations are managed by the boss.
          </p>
        ) : null}
        <StationPanel stations={stations} canManage={canManageStations} />
      </section>

      <section>
        <SectionLabel>Workers</SectionLabel>
        <WorkerPanel workers={workers} stations={stations} />
      </section>
    </div>
  );
}
