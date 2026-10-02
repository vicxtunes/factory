import { ChartsSkeleton, ChipRowSkeleton, StatTilesSkeleton } from "@repo/ui/skeletons/blocks";
import { ContentSkeleton } from "@repo/ui/skeletons/frames";

// Accounts overview: period tabs, figure tiles, chart.
export default function AccountsLoading() {
  return (
    <ContentSkeleton>
      <div className="space-y-6">
        <ChipRowSkeleton count={5} />
        <StatTilesSkeleton count={6} />
        <ChartsSkeleton />
      </div>
    </ContentSkeleton>
  );
}
