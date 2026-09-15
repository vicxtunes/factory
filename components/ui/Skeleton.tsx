// Frosted-glass shimmer block — the base unit for all page skeletons (see
// app/dashboard/(app)/*/loading.tsx). Sized/shaped per call site via
// className; the shimmer/backdrop-blur styling lives in app/globals.css
// (.skeleton-glass) since it needs a ::after pseudo-element.
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton-glass rounded-[var(--radius)] border border-border/40 ${className}`}
    />
  );
}
