"use client";

import Link from "next/link";
import { useState } from "react";

import { Tabs } from "@repo/ui/Tabs";
import type { Offering } from "@repo/lib/offerings/core";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

type View = "package" | "service" | "archived";

/**
 * A business's packages and services, priced in its currency, with archived
 * ones on their own tab. `basePath` links each to `${basePath}/${id}`; null
 * shows the list read-only.
 */
export function OfferingsList({
  active,
  archived,
  scope,
  basePath,
}: {
  active: Offering[];
  archived: Offering[];
  scope: Pick<TenantScope, "currency" | "locale">;
  basePath: string | null;
}) {
  const [view, setView] = useState<View>("package");
  const count = (kind: Offering["kind"]) => active.filter((o) => o.kind === kind).length;
  const shown = view === "archived" ? archived : active.filter((o) => o.kind === view);

  return (
    <div className="space-y-4">
      <Tabs
        label="Show"
        value={view}
        onChange={setView}
        tabs={[
          { key: "package", label: "Packages", count: count("package") },
          { key: "service", label: "Services", count: count("service") },
          { key: "archived", label: "Archived", count: archived.length },
        ]}
      />
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {view === "package" ? "No packages yet." : view === "service" ? "No services yet." : "Nothing archived."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
          {shown.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                {basePath ? (
                  <Link href={`${basePath}/${o.id}`} className="font-medium hover:underline">
                    {o.name}
                  </Link>
                ) : (
                  <p className="font-medium">{o.name}</p>
                )}
                {o.inclusions.length ? <p className="truncate text-xs text-muted">{o.inclusions.join(" · ")}</p> : null}
              </div>
              <p className="shrink-0 text-sm font-medium tnum">{formatAmount(scope, o.price)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
