import { redirect } from "next/navigation";

import { getDashboardSession } from "@/lib/auth/session";
import { fetchApprovalQueueItems, fetchDesigners } from "@/lib/queries";
import { isManagerRole } from "@/lib/types";

import { OrderApprovalQueue } from "../../order-approval-queue";

export const metadata = { title: "Client Orders — Factory Order Tracker" };
export const dynamic = "force-dynamic";

export default async function OrderApprovalsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const [items, designers] = await Promise.all([fetchApprovalQueueItems(), fetchDesigners(true)]);

  return <OrderApprovalQueue items={items} designers={designers} />;
}
