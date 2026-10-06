import { redirect } from "next/navigation";

import { getClientSession } from "@repo/lib/auth/session";

import { ClientShell } from "../shell";
import { OrdersBoardSection } from "../orders-board-section";

export const metadata = { title: "History" };
export const dynamic = "force-dynamic";

export default async function ClientHistoryPage() {
  const session = await getClientSession();
  if (!session) redirect("/?signin=1");

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <OrdersBoardSection clientId={session.client_id} bucket="history" />
    </ClientShell>
  );
}
