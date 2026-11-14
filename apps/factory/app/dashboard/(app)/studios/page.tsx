import Link from "next/link";

import { SpacePriceForm } from "@repo/ui/photos/SpacePriceForm";
import { StudioStatusBadge } from "@repo/ui/studio-access/StatusBadge";
import { StudiosAnalysis } from "@repo/ui/studios/StudiosAnalysis";
import { StudiosTable } from "@repo/ui/studios/StudiosTable";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { Skeleton } from "@repo/ui/Skeleton";
import { ChartsSkeleton, RowsSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { photos } from "@repo/lib/photos/server";
import { studioAccess } from "@repo/lib/studio-access/server";
import { readStudioActivity, requireStudiosOversight, studios } from "@repo/lib/studios/server";
import { sessionCan } from "@repo/lib/auth/session";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function StudiosPage() {
  const manage = sessionCan(await requireStudiosOversight(), "studios", "manage");

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Clients running their own photography business in the system. A business opens once you approve it.</p>
      <section>
        <SectionLabel>At a glance</SectionLabel>
        <Loading
          skeleton={
            <div className="space-y-4">
              <StatTilesSkeleton />
              <ChartsSkeleton />
            </div>
          }
        >
          <Analysis />
        </Loading>
      </section>
      <section>
        <Loading skeleton={<RowsSkeleton rows={2} />}>
          <Waiting />
        </Loading>
      </section>
      <section>
        <SectionLabel>All businesses</SectionLabel>
        <Loading skeleton={<RowsSkeleton />}>
          <All />
        </Loading>
      </section>
      {manage ? (
        <section>
          <SectionLabel>Extra storage</SectionLabel>
          <Loading skeleton={<Skeleton className="h-16 w-full" />}>
            <SpacePrice />
          </Loading>
        </section>
      ) : null}
    </div>
  );
}

async function Waiting() {
  const [review, scope] = await Promise.all([studioAccess.forReview(), resolveTenantScope()]);
  const waiting = review.filter((s) => s.status === "in_review");
  const date = new Intl.DateTimeFormat(scope.locale, { timeZone: scope.timeZone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <>
      <SectionLabel>Waiting for review ({waiting.length})</SectionLabel>
      {waiting.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted">Nothing waiting.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-theme-xs">
          {waiting.map((s) => (
            <li key={s.tenantId}>
              <Link href={`/dashboard/studios/${s.tenantId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-background">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="truncate text-xs text-muted">
                    {s.ownerName} · {s.phone}
                  </p>
                </div>
                <span className="text-xs text-muted tnum">{s.submittedAt ? date.format(new Date(s.submittedAt)) : null}</span>
                <StudioStatusBadge status={s.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

async function SpacePrice() {
  return <SpacePriceForm pricePerGb={await photos.spacePrice()} />;
}

async function Analysis() {
  const [list, activity, scope] = await Promise.all([studios.list(), readStudioActivity(30), resolveTenantScope()]);
  return <StudiosAnalysis studios={list} activity={activity} scope={scope} />;
}

async function All() {
  const [list, scope] = await Promise.all([studios.list(), resolveTenantScope()]);
  return <StudiosTable studios={list} scope={scope} />;
}
