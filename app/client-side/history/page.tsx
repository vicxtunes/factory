import { redirect } from "next/navigation";

import { getClientSession } from "@/lib/auth/session";
import { fetchActiveWorkersPublic, fetchClientItems } from "@/lib/queries";

import { ClientShell } from "../shell";
import { ClientOrdersBoard } from "../orders-board";

export const metadata = { title: "History — Client Portal" };
export const dynamic = "force-dynamic";

export default async function ClientHistoryPage() {
  const session = await getClientSession();
  if (!session) redirect("/client-side?signin=1");

  const [items, workers] = await Promise.all([
    fetchClientItems(session.client_id),
    fetchActiveWorkersPublic(),
  ]);

  return (
    <ClientShell signedIn name={session.name}>
      <ClientOrdersBoard initialItems={items} clientId={session.client_id} workers={workers} bucket="history" />
    </ClientShell>
  );
}
