"use client";

import Link from "next/link";
import { useState } from "react";

import { StudioStatusBadge } from "@repo/ui/studio-access/StatusBadge";
import { TableFilters } from "@repo/ui/TableFilters";
import type { TabItem } from "@repo/ui/Tabs";
import { matchesSearch, prepareSearch } from "@repo/lib/search";
import type { StudioStatus } from "@repo/lib/studio-access/core";
import type { StudioListing } from "@repo/lib/studios/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

type View = "all" | StudioStatus;

const VIEWS: { key: StudioStatus; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "in_review", label: "Waiting for review" },
  { key: "onboarding", label: "Setting up" },
  { key: "changes_requested", label: "Sent back" },
  { key: "suspended", label: "Suspended" },
];

/**
 * Every studio on the platform, for the boss: searchable by business name,
 * owner, phone, email or address (owner, 2026-11-14), with a tab per status.
 */
export function StudiosTable({ studios, scope }: { studios: StudioListing[]; scope: Pick<TenantScope, "locale" | "timeZone"> }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("all");

  if (studios.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
        No businesses yet. A client&apos;s business appears here the first time they open My Business.
      </p>
    );
  }
  const date = new Intl.DateTimeFormat(scope.locale, { timeZone: scope.timeZone, day: "numeric", month: "short", year: "numeric" });

  const query = prepareSearch(search);
  const found = studios.filter((s) => matchesSearch(query, [s.name, s.ownerName, s.phone, s.email, s.address]));
  const shown = view === "all" ? found : found.filter((s) => s.status === view);
  const tabs: TabItem<View>[] = [
    { key: "all", label: "All", count: found.length },
    // Only the statuses some business is in, plus the one picked.
    ...VIEWS.filter((v) => v.key === view || studios.some((s) => s.status === v.key)).map((v) => ({
      key: v.key,
      label: v.label,
      count: found.filter((s) => s.status === v.key).length,
    })),
  ];

  return (
    <div className="space-y-4">
      <TableFilters
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Business, owner, phone, email…"
        searchLabel="Search businesses"
        tabs={tabs}
        tabsLabel="Business status"
        value={view}
        onChange={setView}
      />
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {search.trim() ? `No businesses match “${search.trim()}”.` : "No businesses here."}
        </p>
      ) : (
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
              {shown.map((s) => (
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
      )}
    </div>
  );
}
