"use client";

import { useState } from "react";

// A person's photo, or their initials on a colour picked from their name
// when there's no photo or it fails to load. AvatarStack overlaps several
// with a "+N" for the rest — for assignees on cards, rows and headers.
// Draft — lives in the Design Room until a page adopts it.

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "size-6 text-[0.6rem]",
  md: "size-8 text-xs",
  lg: "size-11 text-sm",
};

// Same name → same colour everywhere, so a person is recognisable at a glance.
const COLOURS = [
  "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400",
  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300",
];

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

function colourFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COLOURS[Math.abs(hash) % COLOURS.length];
}

export interface AvatarPerson {
  name: string;
  src?: string;
}

export function Avatar({ name, src, size = "md", className = "" }: AvatarPerson & { size?: Size; className?: string }) {
  // Remembers which src failed rather than a boolean, so a new src gets a fresh try.
  const [failedSrc, setFailedSrc] = useState<string>();
  const showPhoto = src && src !== failedSrc;

  return (
    <span
      title={name}
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold ${SIZES[size]} ${
        showPhoto ? "bg-background" : colourFor(name)
      } ${className}`}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary photo hosts, can't be allowlisted for next/image
        <img src={src} alt={name} className="size-full object-cover" onError={() => setFailedSrc(src)} />
      ) : (
        <span role="img" aria-label={name}>
          {initials(name)}
        </span>
      )}
    </span>
  );
}

export function AvatarStack({ people, max = 3, size = "sm" }: { people: AvatarPerson[]; max?: number; size?: Size }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <span className="inline-flex items-center -space-x-1">
      {shown.map((p) => (
        <Avatar key={p.name} {...p} size={size} className="ring-2 ring-surface" />
      ))}
      {rest > 0 ? (
        <span
          title={people.slice(max).map((p) => p.name).join(", ")}
          className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gray-100 font-semibold text-gray-600 ring-2 ring-surface dark:bg-white/10 dark:text-gray-300 ${SIZES[size]}`}
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
