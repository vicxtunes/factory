import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { WalletsAdmin } from "@repo/ui/wallet/WalletsAdmin";
import { WithdrawalsQueue } from "@repo/ui/wallet/WithdrawalsQueue";
import { getDashboardSession } from "@repo/lib/auth/session";
import { fetchClients } from "@repo/lib/queries";
import { isManagerRole } from "@repo/lib/types";
import { listPendingDeposits, listPendingWithdrawals, listWallets } from "@repo/lib/wallet/actions";

export const dynamic = "force-dynamic";

export default async function WalletsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <SectionLabel>Client wallets</SectionLabel>
      <Loading skeleton={<RowsSkeleton />}>
        <Wallets />
      </Loading>
    </div>
  );
}

async function Wallets() {
  const [pending, wallets, withdrawals, clients] = await Promise.all([listPendingDeposits(), listWallets(), listPendingWithdrawals(), fetchClients(true)]);
  if (!pending.ok || !wallets.ok || !withdrawals.ok) {
    return <p className="text-sm text-error-600">{!pending.ok ? pending.error : !wallets.ok ? wallets.error : !withdrawals.ok ? withdrawals.error : null}</p>;
  }
  return (
    <div className="space-y-6">
      <WithdrawalsQueue withdrawals={withdrawals.data} />
      <WalletsAdmin
        pending={pending.data}
        wallets={wallets.data}
        clients={clients.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
      />
    </div>
  );
}
