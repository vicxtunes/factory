import { CardGridSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { fetchBoardItems } from "@repo/lib/queries";

import { DisplayBoard } from "./display-board";

// Public, no-login kiosk view meant for a wall-mounted TV on the factory
// floor — deliberately outside /factory (which requires a worker PIN) and
// /dashboard (which requires Supabase Auth). See packages/lib/queries.ts's
// fetchBoardItems for the same factory-stage scoping the interactive board
// uses.
export const metadata = { title: "Production Board — Factory Order Tracker" };
export const dynamic = "force-dynamic";

export default function DisplayPage() {
  return (
    <Loading
      skeleton={
        <div className="p-4">
          <CardGridSkeleton count={12} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" />
        </div>
      }
    >
      <Board />
    </Loading>
  );
}

async function Board() {
  return <DisplayBoard initialItems={await fetchBoardItems()} />;
}
