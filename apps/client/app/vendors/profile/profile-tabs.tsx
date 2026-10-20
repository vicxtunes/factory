"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { OfferList, type OfferView } from "@repo/ui/vendors/OfferList";
import { SocialIcon } from "@repo/ui/vendors/SocialIcon";
import type { SocialNetwork, VendorKind } from "@repo/lib/vendors/core";

const TABS = ["Work", "Services", "About"] as const;

/** The profile's tabs: their work (samples), what they offer and charge, and about them. */
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
  // Every sample, service by service: their work.
  const work = offers.flatMap((o) => o.sampleUrls.flatMap((url) => (url ? [{ url, service: o.name }] : [])));
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
          work.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {work.map((w, i) => (
                <div key={i} className="aspect-[4/3] overflow-hidden rounded-2xl bg-surface">
                  {/* A short-lived signed link to the private bucket: a plain img. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.url} alt={w.service} title={w.service} className="size-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="aspect-[4/3] rounded-2xl border border-dashed border-border bg-surface" />
              ))}
              <p className="col-span-2 text-center text-sm text-muted">
                Samples of your work show here. Add them to your services in{" "}
                <Link href="/vendors/services" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                  Services
                </Link>
                .
              </p>
            </div>
          )
        ) : null}

        {tab === "Services" ? (
          <div className="space-y-5">
            {offers.length ? (
              <OfferList offers={offers} />
            ) : (
              <p className="text-sm text-muted">
                No services yet.{" "}
                <Link href="/vendors/services?add" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                  Add one
                </Link>{" "}
                with its price and samples.
              </p>
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
