import { ChartsSkeleton, StatTilesSkeleton } from "@/components/skeletons/blocks";
import { ContentSkeleton } from "@/components/skeletons/frames";

// Dashboard home: stat cards and the two charts.
export default function DashboardHomeLoading() {
  return (
    <ContentSkeleton>
      <div className="space-y-6">
        <StatTilesSkeleton />
        <ChartsSkeleton />
      </div>
    </ContentSkeleton>
  );
}
