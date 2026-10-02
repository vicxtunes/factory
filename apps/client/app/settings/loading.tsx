import { PanelStackSkeleton } from "@repo/ui/skeletons/blocks";
import { SidebarFrameSkeleton } from "@repo/ui/skeletons/frames";

// Account settings (PIN).
export default function ClientSettingsLoading() {
  return (
    <SidebarFrameSkeleton>
      <PanelStackSkeleton count={1} />
    </SidebarFrameSkeleton>
  );
}
