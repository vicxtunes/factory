"use client";

import Link from "next/link";
import { useState } from "react";

import { Tabs } from "@repo/ui/Tabs";
import type { Service, ServiceWithPackages } from "@repo/lib/offerings/core";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

type View = "on-sale" | "archived";

/**
 * A business's services, each with its packages and their prices, with
 * archived services on their own tab. `basePath` links each service to
 * `${basePath}/${id}`; null shows the list read-only.
 */
export function ServicesList({
  services,
  archived,
  scope,
  basePath,
}: {
  services: ServiceWithPackages[];
  archived: Service[];
  scope: Pick<TenantScope, "currency" | "locale">;
  basePath: string | null;
}) {
  const [view, setView] = useState<View>("on-sale");
  const shown: (Service & { packages?: ServiceWithPackages["packages"] })[] = view === "on-sale" ? services : archived;

  return (
    <div className="space-y-4">
      <Tabs
        label="Show"
        value={view}
        onChange={setView}
        tabs={[
          { key: "on-sale", label: "On sale", count: services.length },
          { key: "archived", label: "Archived", count: archived.length },
        ]}
      />
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {view === "on-sale" ? "No services yet. Add one, then its packages: Gold, Silver, Bronze…" : "Nothing archived."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xs">
          {shown.map((s) => (
            <li key={s.id} className="space-y-1.5 px-4 py-3">
              {basePath ? (
                <Link href={`${basePath}/${s.id}`} className="font-medium hover:underline">
                  {s.name}
                </Link>
              ) : (
                <p className="font-medium">{s.name}</p>
              )}
              {s.packages ? (
                s.packages.length === 0 ? (
                  <p className="text-xs text-muted">No packages yet.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {s.packages.map((p) => (
                      <li key={p.id} className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs">
                        {p.name} <span className="font-medium tnum">{formatAmount(scope, p.price)}</span>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
