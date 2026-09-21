import { redirect } from "next/navigation";

import { getDashboardSession } from "@/lib/auth/session";
import { fetchApprovalQueueItems, fetchDesigners, fetchProductCatalog } from "@/lib/queries";
import { isPhotobookCategory } from "@/lib/orders/photobook";
import { isManagerRole } from "@/lib/types";

import { OrderApprovalQueue } from "../../order-approval-queue";

export const metadata = { title: "Client Orders — Factory Order Tracker" };
export const dynamic = "force-dynamic";

export default async function OrderApprovalsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const [items, designers, catalog] = await Promise.all([
    fetchApprovalQueueItems(),
    fetchDesigners(true),
    fetchProductCatalog(),
  ]);
  const photobookCategoryIds = catalog.filter((c) => isPhotobookCategory(c.name)).map((c) => c.id);

  return <OrderApprovalQueue items={items} designers={designers} photobookCategoryIds={photobookCategoryIds} />;
}
