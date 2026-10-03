"use client";

import { useState } from "react";

// Before / after: the two images stacked, with a divider you drag (or move
// with ← / →, Home / End once focused) to reveal more of one or the other —
// for signing off colour correction and retouching against the original.
// The control is a real range input stretched invisibly over the image, so
// mouse, touch and keyboard all work and screen readers get a slider.
// Both images should be the same shape; `aspect` sets the frame.
// Draft — lives in the Design Room until a page adopts it.

export function CompareSlider({
  before,
  after,
  alt,
  beforeLabel = "Before",
  afterLabel = "After",
  aspect = "3 / 2",
}: {
  before: string;
  after: string;
  /** Describes the photo itself; the labels say which version is which. */
  alt: string;
  beforeLabel?: string;
  afterLabel?: string;
  /** CSS aspect-ratio of the frame, e.g. "1 / 1". */
  aspect?: string;
}) {
  const [position, setPosition] = useState(50);

  return (
    <div className="relative select-none overflow-hidden rounded-[var(--radius)] border border-border bg-gray-100 dark:bg-white/5" style={{ aspectRatio: aspect }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary photo hosts, can't be allowlisted for next/image */}
      <img src={after} alt={`${alt} — ${afterLabel}`} draggable={false} className="absolute inset-0 size-full object-cover" />
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary photo hosts, can't be allowlisted for next/image */}
      <img
        src={before}
        alt={`${alt} — ${beforeLabel}`}
        draggable={false}
        className="absolute inset-0 size-full object-cover"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />

      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">{beforeLabel}</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">{afterLabel}</span>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        aria-label={`Compare ${beforeLabel.toLowerCase()} and ${afterLabel.toLowerCase()}`}
        aria-valuetext={`${position}% ${beforeLabel.toLowerCase()}`}
        className="peer absolute inset-0 z-10 size-full cursor-ew-resize opacity-0"
      />
      {/* Divider + handle — drawn, not interactive (the range input is). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(0,0,0,0.35)] peer-focus-visible:[&>span]:ring-4 peer-focus-visible:[&>span]:ring-brand-500/50"
        style={{ left: `${position}%` }}>
        <span className="absolute top-1/2 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-gray-700 shadow-theme-lg">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5">
            <path d="m7 6-4 4 4 4M13 6l4 4-4 4" />
          </svg>
        </span>
      </div>
    </div>
  );
}
