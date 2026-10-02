import { Skeleton } from "./Skeleton";

// Shared shape for the simple "header + list of rows" dashboard pages
// (clients, agents, products, designers, admins) — each row stands in for a
// name/detail line plus a status pill, roughly matching those pages' panels.
export function ListPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <Skeleton className="h-3 w-28" />
      <div className="overflow-hidden rounded-2xl border border-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 border-b border-border p-4 last:border-b-0"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
            <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
