"use client";

import { useState } from "react";

import { Tabs } from "@repo/ui/Tabs";

// The product walkthrough on Aming's front page (landing.tsx), like
// GitHub's: tabs over one big framed screenshot of a real studio's
// workspace. The pictures are in public/landing/walkthrough.

const SHOTS = [
  { key: "dashboard", label: "Dashboard", caption: "Everything waiting on you, the next shoots and your packages." },
  { key: "bookings", label: "Bookings", caption: "Requests to answer and every shoot on one calendar." },
  { key: "invoices", label: "Invoices", caption: "What each client owes, paid and part-paid, with receipts." },
  { key: "galleries", label: "Galleries", caption: "Finished photos delivered to the client's own page." },
  { key: "page", label: "Your page", caption: "Your public page, under your name, logo and colors." },
] as const;

type Key = (typeof SHOTS)[number]["key"];

export function LandingWalkthrough() {
  const [shown, setShown] = useState<Key>("dashboard");
  const shot = SHOTS.find((s) => s.key === shown)!;
  return (
    <div>
      <Tabs label="Aming Space, part by part" tabs={SHOTS.map(({ key, label }) => ({ key, label }))} value={shown} onChange={setShown} />
      <figure className="mt-6">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xl">
          {/* A browser bar, so it reads as the app it is. */}
          <div aria-hidden className="flex items-center gap-1.5 border-b border-border px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-error-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-success-500/70" />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- static screenshot */}
          <img key={shot.key} src={`/landing/walkthrough/${shot.key}.jpg`} alt={`Aming Space: ${shot.label}`} className="block aspect-[1568/737] w-full object-cover object-top" />
        </div>
        <figcaption className="mt-4 text-center text-sm text-muted">{shot.caption}</figcaption>
      </figure>
    </div>
  );
}
