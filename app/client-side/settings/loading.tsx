import { PanelStackSkeleton } from "@/components/skeletons/blocks";
import { SidebarFrameSkeleton } from "@/components/skeletons/frames";

// Account settings (PIN).
export default function ClientSettingsLoading() {
  return (
    <SidebarFrameSkeleton>
      <PanelStackSkeleton count={1} />
    </SidebarFrameSkeleton>
  );
}
