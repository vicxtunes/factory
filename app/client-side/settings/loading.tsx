import { PanelStackSkeleton } from "@/components/skeletons/blocks";
import { ClientFrameSkeleton } from "@/components/skeletons/frames";

// Account settings (PIN).
export default function ClientSettingsLoading() {
  return (
    <ClientFrameSkeleton>
      <PanelStackSkeleton count={1} />
    </ClientFrameSkeleton>
  );
}
