import { redirect } from "next/navigation";

import { ClientUnpaidInvoices } from "@repo/ui/invoices/ClientUnpaidInvoices";
import { ClientWallet } from "@repo/ui/wallet/ClientWallet";
import { PanelStackSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { getClientSession } from "@repo/lib/auth/session";
import { listMyUnpaidInvoices } from "@repo/lib/invoices/actions";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import { getMyWallet } from "@repo/lib/wallet/actions";

import { dueOn } from "../document-due";

import { ClientShell } from "../shell";

export const metadata = { title: "Wallet" };
export const dynamic = "force-dynamic";

export default async function ClientPaymentPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const session = await getClientSession();
  if (!session) redirect("/?signin=1");

  const params = await searchParams;

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <div className="mx-auto lg:mx-12 w-full max-w-lg space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Wallet</h2>
          <p className="mt-1 text-sm text-muted">
            What you owe and what you hold with us. Clear one invoice, several or all of them here.
          </p>
        </div>
        <Loading skeleton={<PanelStackSkeleton count={3} />}>
          <Wallet startAdding={params.add === "1"} />
        </Loading>
      </div>
    </ClientShell>
  );
}

async function Wallet({ startAdding }: { startAdding: boolean }) {
  const [wallet, unpaid, scope] = await Promise.all([getMyWallet(), listMyUnpaidInvoices(), resolveTenantScope()]);
  if (!wallet.ok) return <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-error-600">{wallet.error}</p>;
  // If the invoices can't load, the wallet still works: it just has no "You owe".
  const invoices = unpaid.ok ? unpaid.data.map((i) => ({ ...i, due: dueOn(scope, "Due", i.dueDate, false) })) : [];
  return (
    <ClientWallet
      wallet={wallet.data}
      startAdding={startAdding}
      owing={invoices.length ? <ClientUnpaidInvoices invoices={invoices} walletBalance={wallet.data.balance} /> : null}
    />
  );
}
