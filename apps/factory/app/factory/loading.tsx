import { CardGridSkeleton, ChipRowSkeleton } from "@repo/ui/skeletons/blocks";
import { HeaderFrameSkeleton } from "@repo/ui/skeletons/frames";

// Factory work queue: status filters and item cards.
export default function FactoryLoading() {
  return (
    <HeaderFrameSkeleton>
      <ChipRowSkeleton />
      <CardGridSkeleton />
    </HeaderFrameSkeleton>
  );
}
