"use client";

import { useState } from "react";
import Link from "next/link";

export interface PackageRowData {
  id: string;
  href: string;
  name: string;
  /** Its service: the tag on the row, and the chip that filters to it. */
  group: string;
  /** Already formatted. */
  price: string;
  /** One line under the name, e.g. what it includes. */
  detail: string | null;
  imageUrl: string | null;
}

const chip = (on: boolean) =>
  `shrink-0 rounded-full px-4 py-2 text-sm font-medium ${on ? "bg-brand-600 text-white" : "border border-border bg-surface text-foreground hover:bg-background"}`;

/** What's on sale, as rows with a thumbnail, filtered by a row of chips ("All", then each group). */
export function PackageList({ packages, allLabel = "All" }: { packages: PackageRowData[]; allLabel?: string }) {
  const groups = [...new Set(packages.map((p) => p.group))];
  const [group, setGroup] = useState<string | null>(null);
  const shown = group ? packages.filter((p) => p.group === group) : packages;

  return (
    <div className="space-y-3">
      {groups.length > 1 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: "none" }}>
          <button type="button" className={chip(group === null)} onClick={() => setGroup(null)}>
            {allLabel}
          </button>
          {groups.map((g) => (
            <button key={g} type="button" className={chip(group === g)} onClick={() => setGroup(g)}>
              {g}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="space-y-3">
        {shown.map((p) => (
          <li key={p.id}>
            <Link href={p.href} className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-2.5 shadow-theme-xs hover:bg-background">
              <span className="size-20 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-100 to-brand-300 dark:from-brand-500/20 dark:to-brand-500/40">
                {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed photo link */}
                {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" className="size-full object-cover" /> : null}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate rounded-md bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{p.group}</span>
                  <span className="shrink-0 text-sm font-bold tnum">{p.price}</span>
                </span>
                <span className="block truncate text-base font-semibold">{p.name}</span>
                {p.detail ? <span className="block truncate text-xs text-muted">{p.detail}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
