"use client";

import { useState } from "react";

import { CardRail, type RailCard } from "./HomeBits";

const chip = (on: boolean) =>
  `shrink-0 rounded-full px-4 py-2 text-sm font-medium ${on ? "bg-brand-600 text-white" : "border border-border bg-surface text-foreground hover:bg-background"}`;

/** What's on sale, as cards to swipe through, filtered by a row of chips ("All", then each card's tag: its service). */
export function PackageList({ packages, allLabel = "All" }: { packages: RailCard[]; allLabel?: string }) {
  const groups = [...new Set(packages.map((p) => p.tag))];
  const [group, setGroup] = useState<string | null>(null);

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
      <CardRail cards={group ? packages.filter((p) => p.tag === group) : packages} />
    </div>
  );
}
