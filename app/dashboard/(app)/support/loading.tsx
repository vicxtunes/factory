import { Skeleton } from "@/components/ui/Skeleton";

export default function SupportLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-6 w-24" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
