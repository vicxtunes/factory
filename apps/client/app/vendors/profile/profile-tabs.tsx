"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { ServiceTiles, type OfferView } from "@repo/ui/vendors/ServiceTiles";
import { SocialIcon } from "@repo/ui/vendors/SocialIcon";
import type { SocialNetwork, VendorKind } from "@repo/lib/vendors/core";
import { buttonClass } from "@repo/ui/Button";

const TABS = ["Services", "About"] as const;

/** The profile's tabs: their services (each opening its details and samples: their work), and about them. */
export function ProfileTabs({
  skills,
  offers,
  socials,
  kind,
  joined,
}: {
  skills: string[];
  offers: OfferView[];
  socials: { id: SocialNetwork; label: string; text: string; href: string }[];
  kind: VendorKind;
  joined: string;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Services");
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
        {tab === "Services" ? (
          <div className="space-y-5">
            {offers.length ? (
              <ServiceTiles offers={offers} />
            ) : (
              <div className="space-y-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
                <p>No services yet. Add what you offer, its price and samples of your work.</p>
                <Link href="/vendors/services?add" className={buttonClass("primary", "sm")}>
                  Add a service
                </Link>
              </div>
            )}
            {skills.length ? (
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => (
                  <span key={s} className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm">
                    {s}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "About" ? (
          <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
            <Row name="Works as" value={kind === "business" ? "A business" : "An individual"} />
            <Row name="On Aming since" value={joined} />
            {socials.map((s) => (
              <Row
                key={s.id}
                name={
                  <span className="flex items-center gap-2">
                    <SocialIcon network={s.id} className="size-4" />
                    {s.label}
                  </span>
                }
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

function Row({ name, value }: { name: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-muted">{name}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
