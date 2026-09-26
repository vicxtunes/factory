import { CardGridSkeleton, TitleRowSkeleton } from "@/components/skeletons/blocks";
import { HeaderFrameSkeleton } from "@/components/skeletons/frames";

// Designer board: "New order" row and order cards.
export default function GraphicsLoading() {
  return (
    <HeaderFrameSkeleton>
      <TitleRowSkeleton />
      <CardGridSkeleton />
    </HeaderFrameSkeleton>
  );
}
