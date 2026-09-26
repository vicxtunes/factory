import { ChipRowSkeleton, ProductGridSkeleton } from "@/components/skeletons/blocks";
import { ClientFrameSkeleton } from "@/components/skeletons/frames";

// Showroom: category tabs and product tiles.
export default function ShowroomLoading() {
  return (
    <ClientFrameSkeleton>
      <ChipRowSkeleton count={5} />
      <ProductGridSkeleton />
    </ClientFrameSkeleton>
  );
}
