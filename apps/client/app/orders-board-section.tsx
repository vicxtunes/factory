import { CardGridSkeleton, ChipRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { fetchActiveWorkersPublic, fetchClientItems } from "@repo/lib/queries";

import { ClientOrdersBoard } from "./orders-board";

// The orders board of My Orders and History: its filters and order cards show
// as a skeleton while the client's orders load. `openOrderId` opens that
// order's details at once (links from its chat: ?order=).
export function OrdersBoardSection({
  clientId,
  bucket,
  openOrderId,
}: {
  clientId: string;
  bucket: "active" | "history";
  openOrderId?: string;
}) {
  return (
    <Loading
      skeleton={
        <>
          <ChipRowSkeleton />
          <CardGridSkeleton />
        </>
      }
    >
      <Board clientId={clientId} bucket={bucket} openOrderId={openOrderId} />
    </Loading>
  );
}

async function Board({ clientId, bucket, openOrderId }: { clientId: string; bucket: "active" | "history"; openOrderId?: string }) {
  const [items, workers] = await Promise.all([fetchClientItems(clientId), fetchActiveWorkersPublic()]);
  const openItemId = openOrderId ? (items.find((i) => i.order_id === openOrderId)?.id ?? null) : null;
  return <ClientOrdersBoard initialItems={items} clientId={clientId} workers={workers} bucket={bucket} openItemId={openItemId} />;
}
