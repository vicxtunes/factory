import { PanelStackSkeleton } from "@/components/skeletons/blocks";
import { ClientFrameSkeleton } from "@/components/skeletons/frames";

// Payment methods.
export default function ClientPaymentLoading() {
  return (
    <ClientFrameSkeleton>
      <PanelStackSkeleton count={3} />
    </ClientFrameSkeleton>
  );
}
