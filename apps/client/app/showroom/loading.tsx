import { ChipRowSkeleton, ProductGridSkeleton } from "@repo/ui/skeletons/blocks";
import { SidebarFrameSkeleton } from "@repo/ui/skeletons/frames";

// Showroom: category tabs and product tiles.
export default function ShowroomLoading() {
  return (
    <SidebarFrameSkeleton>
      <ChipRowSkeleton count={5} />
      <ProductGridSkeleton />
    </SidebarFrameSkeleton>
  );
}
