import { ChipRowSkeleton, ProductGridSkeleton } from "@/components/skeletons/blocks";
import { SidebarFrameSkeleton } from "@/components/skeletons/frames";

// Showroom: category tabs and product tiles.
export default function ShowroomLoading() {
  return (
    <SidebarFrameSkeleton>
      <ChipRowSkeleton count={5} />
      <ProductGridSkeleton />
    </SidebarFrameSkeleton>
  );
}
