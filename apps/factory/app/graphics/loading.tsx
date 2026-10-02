import { CardGridSkeleton, ChipRowSkeleton } from "@repo/ui/skeletons/blocks";
import { SidebarFrameSkeleton } from "@repo/ui/skeletons/frames";
import { Skeleton } from "@repo/ui/Skeleton";

// Designer board: search + New order, status tabs, order cards.
export default function GraphicsLoading() {
  return (
    <SidebarFrameSkeleton>
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex gap-2">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 w-32" />
        </div>
        <ChipRowSkeleton count={5} />
        <CardGridSkeleton />
      </div>
    </SidebarFrameSkeleton>
  );
}
