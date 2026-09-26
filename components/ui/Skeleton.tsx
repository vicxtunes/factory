// Shimmer block — the base unit for all page skeletons (see loading.tsx
// files and components/skeletons/). Sized/shaped per call site via
// className; the tint/shimmer styling lives in app/globals.css
// (.skeleton-glass) since it needs a ::after pseudo-element. `onDark` is for
// blocks drawn on the navy header strip.
export function Skeleton({ className = "", onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton-glass rounded-[var(--radius)] ${onDark ? "skeleton-on-dark" : "border border-border/40"} ${className}`}
    />
  );
}
