"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Showcase, type ShowcaseMedia } from "@repo/ui/showroom/Showcase";
import type { ServiceWithPackages } from "@repo/lib/offerings/core";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";
import type { ShowroomViewMode } from "@repo/lib/types";

import { BookNow } from "./book-now";

// A studio's service in the showroom's item page (@repo/ui/showroom/Showcase):
// its packages as tiers to choose from, each with its price, description and
// what's included, and "Book now" (./book-now.tsx) for the chosen one. The
// page for it is [slug]/s/[service]/page.tsx.
export function ServiceShowcase({
  studio,
  slug,
  service,
  media,
  viewMode,
  showPrices,
  signedIn,
  today,
  scope,
}: {
  studio: { name: string };
  /** The studio's address: "Back to showroom" goes there. */
  slug: string;
  service: ServiceWithPackages;
  media: { coverUrl: string | null; videoUrl: string | null; gallery: ShowcaseMedia[] };
  viewMode: ShowroomViewMode;
  /** The studio's choice: off, every package reads "Price on request". */
  showPrices: boolean;
  /** This device is signed in at the studio: booking needs no name or phone. */
  signedIn: boolean;
  /** The studio's today: the first day that can be booked. */
  today: string;
  scope: Pick<TenantScope, "currency" | "locale" | "timeZone">;
}) {
  const router = useRouter();
  const [chosenId, setChosenId] = useState("");

  return (
    <Showcase
      item={{
        id: service.id,
        name: service.name,
        description: service.description,
        coverUrl: media.coverUrl,
        previewVideoUrl: media.videoUrl,
        gallery: media.gallery,
      }}
      viewMode={viewMode}
      onExit={() => router.push(`/${slug}`)}
      shareable
      details={
        service.packages.length === 0 ? (
          <p className="text-lg font-semibold text-showroom-ink/70">Ask us for prices</p>
        ) : (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-widest text-showroom-ink/60">Choose a package</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {service.packages.map((p) => {
                const selected = p.id === chosenId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setChosenId(selected ? "" : p.id)}
                    aria-pressed={selected}
                    className={`flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors ${
                      // Solid brand orange edge when chosen, as the factory's size picker.
                      selected
                        ? "border-brand-600 bg-brand-600/10 ring-2 ring-brand-600"
                        : "border-showroom-ink/25 bg-showroom-ink/5 hover:bg-showroom-ink/10"
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-lg font-bold">{p.name}</span>
                      <span className="shrink-0 text-lg font-bold tabular-nums text-brand-600 dark:text-brand-400">
                        {/* A tier priced 0 ("Custom") is quoted on request; quotations still use the number. */}
                        {showPrices && p.price > 0 ? formatAmount(scope, p.price) : "Price on request"}
                      </span>
                    </span>
                    {p.description ? <span className="block whitespace-pre-line text-sm text-showroom-ink/60">{p.description}</span> : null}
                    {p.inclusions.length ? (
                      <ul className="space-y-1 text-sm">
                        {p.inclusions.map((item, i) => (
                          <li key={i} className="flex gap-2">
                            <span aria-hidden="true" className="text-brand-600 dark:text-brand-400">
                              ✓
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        )
      }
      action={
        <BookNow
          studio={{ name: studio.name, slug }}
          serviceSlug={service.slug}
          packages={service.packages}
          chosenId={chosenId}
          signedIn={signedIn}
          today={today}
          showPrices={showPrices}
          scope={scope}
        />
      }
    />
  );
}
