import Link from "next/link";

import { StudioStatusBadge } from "@repo/ui/studio-access/StatusBadge";
import { StudiosTable } from "@repo/ui/studios/StudiosTable";
import { SectionLabel } from "@repo/ui/SectionLabel";
import { studioAccess } from "@repo/lib/studio-access/server";
import { requireStudiosOversight, studios } from "@repo/lib/studios/server";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

export const dynamic = "force-dynamic";

export default async function StudiosPage() {
  await requireStudiosOversight();
  const [list, review, scope] = await Promise.all([studios.list(), studioAccess.forReview(), resolveTenantScope()]);
  const waiting = review.filter((s) => s.status === "in_review");
  const date = new Intl.DateTimeFormat(scope.locale, { timeZone: scope.timeZone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Clients running their own photography studio in the system. A studio opens once you approve it.</p>
      <section>
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
      </section>
      <section>
        <SectionLabel>All studios</SectionLabel>
        <StudiosTable studios={list} scope={scope} />
      </section>
    </div>
  );
}
