import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@repo/ui/Button";
import { getClientSession } from "@repo/lib/auth/session";

import { ClientShell } from "../shell";
import { OrdersBoardSection } from "../orders-board-section";

export const metadata = { title: "My Orders" };
export const dynamic = "force-dynamic";

export default async function ClientOrdersPage() {
  const session = await getClientSession();
  if (!session) redirect("/?signin=1");

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <div className="mb-4 flex justify-end">
        <Link href="/new">
          <Button variant="primary">+ New order</Button>
        </Link>
      </div>
      <OrdersBoardSection clientId={session.client_id} bucket="active" />
    </ClientShell>
  );
}
