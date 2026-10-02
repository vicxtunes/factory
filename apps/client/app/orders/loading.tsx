import { CardGridSkeleton, ChipRowSkeleton, TitleRowSkeleton } from "@repo/ui/skeletons/blocks";
import { SidebarFrameSkeleton } from "@repo/ui/skeletons/frames";

// "My orders": New order button, status filters, order cards.
export default function ClientOrdersLoading() {
  return (
    <SidebarFrameSkeleton>
      <TitleRowSkeleton />
      <ChipRowSkeleton />
      <CardGridSkeleton />
    </SidebarFrameSkeleton>
  );
}
