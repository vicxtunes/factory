"use client";

import Link from "next/link";
import { useState } from "react";

import { Tabs } from "@repo/ui/Tabs";
import type { QuotationStatus, QuotationSummary } from "@repo/lib/billing/core";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { QuotationStatusBadge } from "./StatusBadges";

type View = "all" | QuotationStatus;

/**
 * Quotations, newest first, by status. `basePath` links each to
 * `${basePath}/${id}`; null shows the list read-only.
 */
export function QuotationsList({
  quotations,
  scope,
  basePath,
  showClient = true,
}: {
  quotations: QuotationSummary[];
  scope: Omit<TenantScope, "tenantId">;
  basePath: string | null;
  /** Off on a client's own page, where every row is theirs. */
  showClient?: boolean;
}) {
  const [view, setView] = useState<View>("all");
  const count = (s: QuotationStatus) => quotations.filter((q) => q.status === s).length;
  const shown = view === "all" ? quotations : quotations.filter((q) => q.status === view);

  return (
    <div className="space-y-4">
      <Tabs
        label="Show"
        value={view}
        onChange={setView}
        tabs={[
          { key: "all", label: "All", count: quotations.length },
          { key: "open", label: "Open", count: count("open") },
          { key: "accepted", label: "Accepted", count: count("accepted") },
          { key: "declined", label: "Declined", count: count("declined") },
          { key: "expired", label: "Expired", count: count("expired") },
        ]}
      />
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No quotations here.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
          {shown.map((q) => (
            <li key={q.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {basePath ? (
                    <Link href={`${basePath}/${q.id}`} className="hover:underline">
                      {q.number}
                    </Link>
                  ) : (
                    q.number
                  )}
                  {showClient ? <span className="font-normal text-muted"> · {q.billTo.name}</span> : null}
                </p>
                <p className="text-xs text-muted">{formatDay(scope, q.issuedAt)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium tnum">{formatAmount(scope, q.total)}</p>
                <QuotationStatusBadge status={q.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
