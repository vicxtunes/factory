import { CardGridSkeleton, ChipRowSkeleton } from "@/components/skeletons/blocks";
import { HeaderFrameSkeleton } from "@/components/skeletons/frames";

// Factory work queue: status filters and item cards.
export default function FactoryLoading() {
  return (
    <HeaderFrameSkeleton>
      <ChipRowSkeleton />
      <CardGridSkeleton />
    </HeaderFrameSkeleton>
  );
}
