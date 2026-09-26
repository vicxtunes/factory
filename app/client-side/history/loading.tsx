import { CardGridSkeleton, ChipRowSkeleton } from "@/components/skeletons/blocks";
import { ClientFrameSkeleton } from "@/components/skeletons/frames";

// Order history: filters and finished order cards.
export default function ClientHistoryLoading() {
  return (
    <ClientFrameSkeleton>
      <ChipRowSkeleton />
      <CardGridSkeleton />
    </ClientFrameSkeleton>
  );
}
