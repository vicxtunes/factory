import { CardGridSkeleton, ChipRowSkeleton } from "@repo/ui/skeletons/blocks";
import { SidebarFrameSkeleton } from "@repo/ui/skeletons/frames";

// Order history: filters and finished order cards.
export default function ClientHistoryLoading() {
  return (
    <SidebarFrameSkeleton>
      <ChipRowSkeleton />
      <CardGridSkeleton />
    </SidebarFrameSkeleton>
  );
}
