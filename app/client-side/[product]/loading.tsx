import { ProductDetailSkeleton } from "@/components/skeletons/blocks";
import { SidebarFrameSkeleton } from "@/components/skeletons/frames";

// A single product's page: media on one side, details and actions on the other.
export default function ProductLoading() {
  return (
    <SidebarFrameSkeleton>
      <ProductDetailSkeleton />
    </SidebarFrameSkeleton>
  );
}
