import { redirect } from "next/navigation";

import { getClientSession } from "@repo/lib/auth/session";
import { fetchActiveWorkersPublic, fetchClientItems } from "@repo/lib/queries";

import { ClientShell } from "../shell";
import { ClientOrdersBoard } from "../orders-board";

export const metadata = { title: "History — Client Portal" };
export const dynamic = "force-dynamic";

export default async function ClientHistoryPage() {
  const session = await getClientSession();
  if (!session) redirect("/?signin=1");

  const [items, workers] = await Promise.all([
    fetchClientItems(session.client_id),
    fetchActiveWorkersPublic(),
  ]);

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <ClientOrdersBoard initialItems={items} clientId={session.client_id} workers={workers} bucket="history" />
    </ClientShell>
  );
}
