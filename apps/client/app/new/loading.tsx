import { FormSkeleton } from "@repo/ui/skeletons/blocks";
import { SidebarFrameSkeleton } from "@repo/ui/skeletons/frames";

// New order form.
export default function ClientNewOrderLoading() {
  return (
    <SidebarFrameSkeleton>
      <FormSkeleton fields={6} />
    </SidebarFrameSkeleton>
  );
}
