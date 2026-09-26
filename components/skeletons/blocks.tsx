import { Skeleton } from "@/components/ui/Skeleton";

// Content shapes shared by the loading.tsx files. Each roughly matches the
// real content that will replace it, so the page doesn't jump when it loads.

/** A heading line with an optional action button on the right. */
export function TitleRowSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <Skeleton className="h-6 w-40" />
      {action ? <Skeleton className="h-10 w-28" /> : null}
    </div>
  );
}

/** A row of chips (tabs / filters). */
export function ChipRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-24 rounded-full" />
      ))}
    </div>
  );
}

/** Summary number tiles (dashboards). */
export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Order / item cards: title line, meta line, status pill. */
export function CardGridSkeleton({ count = 6, className = "grid gap-4 md:grid-cols-2 xl:grid-cols-3" }: { count?: number; className?: string }) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Product tiles: image, name, short line. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** One product: media on one side, name/description/actions on the other. */
export function ProductDetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-16 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
        <div className="flex gap-3 pt-2">
          <Skeleton className="h-11 w-36" />
          <Skeleton className="h-11 w-28" />
        </div>
      </div>
    </div>
  );
}

/** A form: labelled fields and a submit button. */
export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 rounded-2xl border border-border bg-surface p-5">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-11 w-full" />
        </div>
      ))}
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

/** Stacked panels (settings, payment, support). */
export function PanelStackSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-border bg-surface p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-11 w-40" />
        </div>
      ))}
    </div>
  );
}

/** A banner/carousel strip (client home, showroom). */
export function BannerSkeleton() {
  return <Skeleton className="mb-6 h-40 w-full rounded-2xl sm:h-56" />;
}

/** Two chart panels side by side (dashboard home, client home). */
export function ChartsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-48 w-full" />
        </div>
      ))}
    </div>
  );
}
