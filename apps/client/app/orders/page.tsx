import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { getClientSession } from "@repo/lib/auth/session";
import { fetchActiveWorkersPublic, fetchClientItems } from "@repo/lib/queries";

import { ClientShell } from "../shell";
import { ClientOrdersBoard } from "../orders-board";

export const metadata = { title: "My Orders" };
export const dynamic = "force-dynamic";

export default async function ClientOrdersPage() {
  const session = await getClientSession();
  if (!session) redirect("/?signin=1");

  const [items, workers] = await Promise.all([
    fetchClientItems(session.client_id),
    fetchActiveWorkersPublic(),
  ]);

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <div className="mb-4 flex justify-end">
        <Link href="/new">
          <Button variant="primary">+ New order</Button>
        </Link>
      </div>
      <ClientOrdersBoard initialItems={items} clientId={session.client_id} workers={workers} bucket="active" />
    </ClientShell>
  );
}
