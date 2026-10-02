import { PanelStackSkeleton } from "@repo/ui/skeletons/blocks";
import { ContentSkeleton } from "@repo/ui/skeletons/frames";

// /support content placeholder while the page loads.
export default function SupportLoading() {
  return (
    <ContentSkeleton>
      <div className="px-4 py-6">
        <PanelStackSkeleton count={2} />
      </div>
    </ContentSkeleton>
  );
}
