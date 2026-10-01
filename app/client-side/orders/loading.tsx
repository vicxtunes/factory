import { CardGridSkeleton, ChipRowSkeleton, TitleRowSkeleton } from "@/components/skeletons/blocks";
import { SidebarFrameSkeleton } from "@/components/skeletons/frames";

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
