import Link from "next/link";

import { StudioStatusBadge } from "@repo/ui/studio-access/StatusBadge";
import type { StudioListing } from "@repo/lib/studios/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

/** Every studio on the platform, for the boss. */
export function StudiosTable({ studios, scope }: { studios: StudioListing[]; scope: Pick<TenantScope, "locale" | "timeZone"> }) {
  if (studios.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
        No businesses yet. A client&apos;s business appears here the first time they open My Business.
      </p>
    );
  }
  const date = new Intl.DateTimeFormat(scope.locale, { timeZone: scope.timeZone, day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-theme-xs">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2 font-medium">Business</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Owner</th>
            <th className="px-4 py-2 font-medium">Contact</th>
            <th className="px-4 py-2 font-medium">Opened</th>
          </tr>
        </thead>
        <tbody>
          {studios.map((s) => (
            <tr key={s.id} className="border-b border-border last:border-0 hover:bg-background">
              <td className="px-4 py-2">
                <Link href={`/dashboard/studios/${s.id}`} className="font-medium hover:underline">
                  {s.name}
                </Link>
              </td>
              <td className="px-4 py-2">
                <StudioStatusBadge status={s.status} />
              </td>
              <td className="px-4 py-2">{s.ownerName}</td>
              <td className="px-4 py-2 text-muted">
                {s.phone ? <p className="tnum">{s.phone}</p> : null}
                {s.email ? <p>{s.email}</p> : null}
                {!s.phone && !s.email ? "—" : null}
              </td>
              <td className="whitespace-nowrap px-4 py-2 tnum">{date.format(new Date(s.createdAt))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
