import { redirect } from "next/navigation";

import { PaymentMethods } from "@/components/payments/PaymentMethods";
import { ClientWallet } from "@/components/wallet/ClientWallet";
import { getClientSession } from "@/lib/auth/session";
import { getMyWallet } from "@/lib/wallet/actions";

import { ClientShell } from "../shell";

export const metadata = { title: "Wallet — Client Portal" };
export const dynamic = "force-dynamic";

export default async function ClientPaymentPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const session = await getClientSession();
  if (!session) redirect("/client-side?signin=1");

  const [wallet, params] = await Promise.all([getMyWallet(), searchParams]);

  return (
    <ClientShell signedIn name={session.name} avatarUrl={session.avatarUrl}>
      <div className="mx-12 w-full max-w-lg space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Wallet</h2>
          <p className="mt-1 text-sm text-muted">
            Pay upfront and keep a balance with us, then pay for orders from it in one tap.
          </p>
        </div>
        {wallet.ok ? (
          <ClientWallet wallet={wallet.data} howToPay={<PaymentMethods />} startAdding={params.add === "1"} />
        ) : (
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-error-600">{wallet.error}</p>
        )}
      </div>
    </ClientShell>
  );
}
