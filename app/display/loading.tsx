import { CardGridSkeleton } from "@/components/skeletons/blocks";
import { ContentSkeleton } from "@/components/skeletons/frames";

// Factory TV board: full-width grid of item tiles.
export default function DisplayLoading() {
  return (
    <ContentSkeleton>
      <div className="p-4">
        <CardGridSkeleton count={12} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" />
      </div>
    </ContentSkeleton>
  );
}
