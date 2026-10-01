import { FormSkeleton } from "@/components/skeletons/blocks";
import { SidebarFrameSkeleton } from "@/components/skeletons/frames";

// New order form.
export default function ClientNewOrderLoading() {
  return (
    <SidebarFrameSkeleton>
      <FormSkeleton fields={6} />
    </SidebarFrameSkeleton>
  );
}
