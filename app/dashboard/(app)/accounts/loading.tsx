import { ChartsSkeleton, ChipRowSkeleton, StatTilesSkeleton } from "@/components/skeletons/blocks";
import { ContentSkeleton } from "@/components/skeletons/frames";

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
