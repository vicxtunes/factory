import { PanelStackSkeleton } from "@/components/skeletons/blocks";
import { ContentSkeleton } from "@/components/skeletons/frames";

// /support renders inside whichever surface the visitor came from (dashboard,
// graphics, factory, client portal), which isn't known before the page
// loads, so this draws only the content: notifications + tickets panels.
export default function SupportLoading() {
  return (
    <ContentSkeleton>
      <div className="px-4 py-6">
        <PanelStackSkeleton count={2} />
      </div>
    </ContentSkeleton>
  );
}
