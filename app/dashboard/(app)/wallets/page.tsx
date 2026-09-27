import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { WalletsAdmin } from "@/components/wallet/WalletsAdmin";
import { getDashboardSession } from "@/lib/auth/session";
import { fetchClients } from "@/lib/queries";
import { isManagerRole } from "@/lib/types";
import { listPendingDeposits, listWallets } from "@/lib/wallet/actions";

export const dynamic = "force-dynamic";

export default async function WalletsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const [pending, wallets, clients] = await Promise.all([listPendingDeposits(), listWallets(), fetchClients(true)]);
  if (!pending.ok || !wallets.ok) {
    return <p className="text-sm text-error-600">{!pending.ok ? pending.error : !wallets.ok ? wallets.error : null}</p>;
  }

  return (
    <div className="space-y-6">
      <SectionLabel>Client wallets</SectionLabel>
      <WalletsAdmin
        pending={pending.data}
        wallets={wallets.data}
        clients={clients.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
      />
    </div>
  );
}
