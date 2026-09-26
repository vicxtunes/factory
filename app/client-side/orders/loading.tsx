import { CardGridSkeleton, ChipRowSkeleton, TitleRowSkeleton } from "@/components/skeletons/blocks";
import { ClientFrameSkeleton } from "@/components/skeletons/frames";

// "My orders": New order button, status filters, order cards.
export default function ClientOrdersLoading() {
  return (
    <ClientFrameSkeleton>
      <TitleRowSkeleton />
      <ChipRowSkeleton />
      <CardGridSkeleton />
    </ClientFrameSkeleton>
  );
}
