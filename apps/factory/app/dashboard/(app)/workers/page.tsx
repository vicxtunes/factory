import { SectionLabel } from "@repo/ui/SectionLabel";
import { Skeleton } from "@repo/ui/Skeleton";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { requireDashboard, sessionCan } from "@repo/lib/auth/session";
import type { Station, Worker } from "@repo/lib/types";
import { redirect } from "next/navigation";

import { StationPanel } from "../../station-panel";
import { WorkerPanel } from "../../worker-panel";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const session = await requireDashboard();
  const seesWorkers = sessionCan(session, "workers");
  if (!seesWorkers && !sessionCan(session, "stations")) redirect("/dashboard");

  // Read once: the stations show on their own and in the workers' station choice.
  // (A Supabase query runs again on every await; a Promise of its rows doesn't.)
  const stations = Promise.resolve(createAdminClient().from("stations").select("id, name, created_at").order("name")).then(
    ({ data }) => (data ?? []) as Station[],
  );
  const canManageStations = sessionCan(session, "stations", "manage");

  return (
    <div className="space-y-8">
      <section>
        <SectionLabel>Stations</SectionLabel>
        {!canManageStations ? (
          <p className="mb-3 text-sm text-muted">
            View only — stations are changed by whoever manages Stations.
          </p>
        ) : null}
        <Loading
          skeleton={
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-28 rounded-full" />
              ))}
            </div>
          }
        >
          <Stations stations={stations} canManage={canManageStations} />
        </Loading>
      </section>

      {seesWorkers ? (
        <section>
          <SectionLabel>Workers</SectionLabel>
          <Loading skeleton={<RowsSkeleton />}>
            <Workers stations={stations} canManageSecurity={sessionCan(session, "worker_logins", "manage")} canEdit={sessionCan(session, "workers", "manage")} />
          </Loading>
        </section>
      ) : null}
    </div>
  );
}

async function Stations({ stations, canManage }: { stations: Promise<Station[]>; canManage: boolean }) {
  return <StationPanel stations={await stations} canManage={canManage} />;
}

async function Workers({ stations, canManageSecurity, canEdit }: { stations: Promise<Station[]>; canManageSecurity: boolean; canEdit: boolean }) {
  const [workersRes, stationList] = await Promise.all([
    createAdminClient().from("workers").select("id, name, station, active, created_at").order("name"),
    stations,
  ]);
  return (
    <WorkerPanel
      workers={(workersRes.data ?? []) as Omit<Worker, "pin_hash">[]}
      stations={stationList}
      canManageSecurity={canManageSecurity}
      canEdit={canEdit}
    />
  );
}
