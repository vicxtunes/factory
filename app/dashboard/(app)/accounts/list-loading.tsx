import { ChipRowSkeleton, PanelStackSkeleton } from "@/components/skeletons/blocks";
import { ContentSkeleton } from "@/components/skeletons/frames";
import { Skeleton } from "@/components/ui/Skeleton";

// Shared loading state for the Accounts lists (sales, client accounts, one
// client): search, tabs, table.
export default function AccountsListLoading() {
  return (
    <ContentSkeleton>
      <div className="space-y-4">
        <Skeleton className="h-11 w-full" />
        <ChipRowSkeleton count={5} />
        <PanelStackSkeleton count={2} />
      </div>
    </ContentSkeleton>
  );
}
