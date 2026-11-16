"use client";

import { useEffect, useState } from "react";

// The product walkthrough on Aming's front page (landing.tsx), like
// GitHub's: tabs over one big framed screenshot of a real studio's
// workspace, playing by itself. Each tab shows for STEP_MS with a bar
// filling under it (globals.css), then the next; choosing a tab stops the
// play, and it never plays for reduced motion. The pictures are in
// public/landing/walkthrough.

const STEP_MS = 6000;

const SHOTS = [
  { key: "dashboard", label: "Dashboard", caption: "Everything waiting on you, the next shoots and your packages." },
  { key: "bookings", label: "Bookings", caption: "Requests to answer and every shoot on one calendar." },
  { key: "invoices", label: "Invoices", caption: "What each client owes, paid and part-paid, with receipts." },
  { key: "galleries", label: "Galleries", caption: "Finished photos delivered to the client's own page." },
  { key: "page", label: "Your page", caption: "Your public page, under your name, logo and colors." },
] as const;

export function LandingWalkthrough() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % SHOTS.length), STEP_MS);
    return () => clearTimeout(timer);
  }, [index, playing]);

  return (
    <div>
      <div role="tablist" aria-label="Aming Space, part by part" className="flex overflow-x-auto border-b border-border">
        {SHOTS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => {
              setIndex(i);
              setPlaying(false);
            }}
            className={`relative shrink-0 px-4 py-3 text-sm font-medium transition-colors ${i === index ? "text-foreground" : "text-muted hover:text-foreground"}`}
          >
            {s.label}
            {i === index ? (
              <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5">
                <span key={`${index}-${playing}`} className={`block h-full bg-brand-500 ${playing ? "landing-walkthrough-fill" : ""}`} style={{ animationDuration: `${STEP_MS}ms` }} />
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <figure className="mt-6">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-theme-xl">
          {/* A browser bar, so it reads as the app it is. */}
          <div aria-hidden className="flex items-center gap-1.5 border-b border-border px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-error-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-success-500/70" />
          </div>
          {/* All five stacked, the shown one faded in, so switching never waits on a download. */}
          <div className="relative aspect-[1568/737]">
            {SHOTS.map((s, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- static screenshot
              <img
                key={s.key}
                src={`/landing/walkthrough/${s.key}.jpg`}
                alt={i === index ? `Aming Space: ${s.label}` : ""}
                aria-hidden={i !== index}
                className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500 ${i === index ? "opacity-100" : "opacity-0"}`}
              />
            ))}
          </div>
        </div>
        <figcaption className="mt-4 text-center text-sm text-muted">{SHOTS[index].caption}</figcaption>
      </figure>
    </div>
  );
}
