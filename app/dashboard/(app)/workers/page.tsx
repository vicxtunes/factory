import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardSession } from "@/lib/auth/session";
import { canManageWorkerSecurity, isManagerRole, type Station, type Worker } from "@/lib/types";

import { AccessRequestsPanel, type AccessRequest } from "../../access-requests-panel";
import { StationPanel } from "../../station-panel";
import { WorkerPanel } from "../../worker-panel";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const admin = createAdminClient();
  const [workersRes, stationsRes, requestsRes, linkedRes] = await Promise.all([
    admin
      .from("workers")
      .select("id, name, station, active, created_at")
      .order("name"),
    admin.from("stations").select("id, name, created_at").order("name"),
    admin
      .from("worker_access_requests")
      .select("id, name, email, phone, note, created_at")
      .eq("status", "pending")
      .order("created_at"),
    admin.from("worker_identities").select("worker_id"),
  ]);

  const workers = (workersRes.data ?? []) as Omit<Worker, "pin_hash">[];
  const stations = (stationsRes.data ?? []) as Station[];
  const canManageStations = session.role === "boss";
  const requests = (requestsRes.data ?? []) as AccessRequest[];
  const linked = new Set((linkedRes.data ?? []).map((r) => r.worker_id));
  const unlinkedWorkers = workers.filter((w) => w.active && !linked.has(w.id)).map((w) => ({ id: w.id, name: w.name }));

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

      {canManageWorkerSecurity(session.role) ? (
        <section>
          <SectionLabel>{`Access requests${requests.length ? ` (${requests.length})` : ""}`}</SectionLabel>
          <AccessRequestsPanel requests={requests} stations={stations} unlinkedWorkers={unlinkedWorkers} />
        </section>
      ) : null}

      <section>
        <SectionLabel>Workers</SectionLabel>
        <WorkerPanel
          workers={workers}
          stations={stations}
          canManageSecurity={canManageWorkerSecurity(session.role)}
        />
      </section>
    </div>
  );
}
