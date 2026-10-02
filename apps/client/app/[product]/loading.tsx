import { ProductDetailSkeleton } from "@repo/ui/skeletons/blocks";
import { SidebarFrameSkeleton } from "@repo/ui/skeletons/frames";

// A single product's page: media on one side, details and actions on the other.
export default function ProductLoading() {
  return (
    <SidebarFrameSkeleton>
      <ProductDetailSkeleton />
    </SidebarFrameSkeleton>
  );
}
