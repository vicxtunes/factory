import { PanelStackSkeleton } from "@/components/skeletons/blocks";
import { SidebarFrameSkeleton } from "@/components/skeletons/frames";

// Payment methods.
export default function ClientPaymentLoading() {
  return (
    <SidebarFrameSkeleton>
      <PanelStackSkeleton count={3} />
    </SidebarFrameSkeleton>
  );
}
