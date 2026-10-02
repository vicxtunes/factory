import { PanelStackSkeleton } from "@repo/ui/skeletons/blocks";
import { SidebarFrameSkeleton } from "@repo/ui/skeletons/frames";

// Payment methods.
export default function ClientPaymentLoading() {
  return (
    <SidebarFrameSkeleton>
      <PanelStackSkeleton count={3} />
    </SidebarFrameSkeleton>
  );
}
