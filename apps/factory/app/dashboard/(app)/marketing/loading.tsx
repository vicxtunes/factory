import { ProductGridSkeleton } from "@repo/ui/skeletons/blocks";
import { Skeleton } from "@repo/ui/Skeleton";

// Marketing carousel slides.
export default function MarketingLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-3 w-56" />
      <ProductGridSkeleton count={4} />
    </div>
  );
}
