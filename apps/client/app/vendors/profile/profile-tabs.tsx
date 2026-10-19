"use client";

import { useState, type ReactNode } from "react";

import type { VendorKind } from "@repo/lib/vendors/core";

const TABS = ["Work", "Services", "About"] as const;

/** The profile's tabs: their work (samples), what they offer, and about them. */
export function ProfileTabs({
  skills,
  socials,
  kind,
  joined,
}: {
  skills: string[];
  socials: { id: string; label: string; text: string; href: string }[];
  kind: VendorKind;
  joined: string;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Work");
  return (
    <div className="mt-8">
      <div role="tablist" className="flex gap-8 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors ${
              tab === t ? "border-brand-500 text-brand-600 dark:text-brand-400" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="py-6">
        {tab === "Work" ? (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="aspect-[4/3] rounded-2xl border border-dashed border-border bg-surface" />
            ))}
            <p className="col-span-2 text-center text-sm text-muted">Samples of your work show here. Adding them comes next.</p>
          </div>
        ) : null}

        {tab === "Services" ? (
          skills.length ? (
            <div className="flex flex-wrap gap-2">
              {skills.map((s) => (
                <span key={s} className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm">
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No services yet.</p>
          )
        ) : null}

        {tab === "About" ? (
          <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
            <Row name="Works as" value={kind === "business" ? "A business" : "An individual"} />
            <Row name="On Aming since" value={joined} />
            {socials.map((s) => (
              <Row
                key={s.id}
                name={s.label}
                value={
                  <a href={s.href} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline dark:text-brand-400">
                    {s.text}
                  </a>
                }
              />
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}

function Row({ name, value }: { name: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-muted">{name}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
