import { BannerSkeleton, ChartsSkeleton, ChipRowSkeleton, StatTilesSkeleton } from "@/components/skeletons/blocks";
import { ClientFrameSkeleton } from "@/components/skeletons/frames";

// Client home (dashboard for signed-in clients, showroom for visitors):
// quick actions, marketing banner, summary tiles and charts.
export default function ClientHomeLoading() {
  return (
    <ClientFrameSkeleton>
      <div className="space-y-6">
        <ChipRowSkeleton count={3} />
        <BannerSkeleton />
        <StatTilesSkeleton />
        <ChartsSkeleton />
      </div>
    </ClientFrameSkeleton>
  );
}
