import { CardGridSkeleton, ChipRowSkeleton } from "@/components/skeletons/blocks";
import { SidebarFrameSkeleton } from "@/components/skeletons/frames";

// Order history: filters and finished order cards.
export default function ClientHistoryLoading() {
  return (
    <SidebarFrameSkeleton>
      <ChipRowSkeleton />
      <CardGridSkeleton />
    </SidebarFrameSkeleton>
  );
}
