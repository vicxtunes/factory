import { CardGridSkeleton, ChipRowSkeleton } from "@/components/skeletons/blocks";

// Quote/approval queue.
export default function OrderApprovalsLoading() {
  return (
    <div>
      <ChipRowSkeleton count={3} />
      <CardGridSkeleton />
    </div>
  );
}
