import { Skeleton } from "@/components/ui/Skeleton";

export default function WorkersLoading() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <div className="overflow-hidden rounded-2xl border border-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 border-b border-border p-4 last:border-b-0"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/5" />
              </div>
              <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
