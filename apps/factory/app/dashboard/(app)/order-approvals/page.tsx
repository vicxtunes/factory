import { redirect } from "next/navigation";

import { CardGridSkeleton, ChipRowSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { getDashboardSession } from "@repo/lib/auth/session";
import { fetchApprovalQueueItems, fetchDesigners, fetchProductCatalog } from "@repo/lib/queries";
import { isPhotobookCategory } from "@repo/lib/orders/photobook";
import { isManagerRole } from "@repo/lib/types";

import { OrderApprovalQueue } from "../../order-approval-queue";

export const metadata = { title: "Client Orders — Factory Order Tracker" };

export default async function OrderApprovalsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  return (
    <Loading
      skeleton={
        <>
          <ChipRowSkeleton count={3} />
          <CardGridSkeleton />
        </>
      }
    >
      <Queue canCancel={session.role === "boss"} />
    </Loading>
  );
}

async function Queue({ canCancel }: { canCancel: boolean }) {
  const [items, designers, catalog] = await Promise.all([
    fetchApprovalQueueItems(),
    fetchDesigners(true),
    fetchProductCatalog(),
  ]);
  const photobookCategoryIds = catalog.filter((c) => isPhotobookCategory(c.name)).map((c) => c.id);
  return <OrderApprovalQueue items={items} designers={designers} photobookCategoryIds={photobookCategoryIds} canCancel={canCancel} />;
}
