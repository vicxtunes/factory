import { CardGridSkeleton, ChipRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { fetchActiveWorkersPublic, fetchClientItems } from "@repo/lib/queries";

import { ClientOrdersBoard } from "./orders-board";

// The orders board of My Orders and History: its filters and order cards show
// as a skeleton while the client's orders load.
export function OrdersBoardSection({ clientId, bucket }: { clientId: string; bucket: "active" | "history" }) {
  return (
    <Loading
      skeleton={
        <>
          <ChipRowSkeleton />
          <CardGridSkeleton />
        </>
      }
    >
      <Board clientId={clientId} bucket={bucket} />
    </Loading>
  );
}

async function Board({ clientId, bucket }: { clientId: string; bucket: "active" | "history" }) {
  const [items, workers] = await Promise.all([fetchClientItems(clientId), fetchActiveWorkersPublic()]);
  return <ClientOrdersBoard initialItems={items} clientId={clientId} workers={workers} bucket={bucket} />;
}
