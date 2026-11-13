import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { getDashboardSession, sessionCan } from "@repo/lib/auth/session";
import { listMoneyAccounts } from "@repo/lib/wallet/actions";
import { listOpenAgentWithdrawals } from "@repo/lib/wallet/agent";

import { AgentTabs } from "../agent-tabs";
import { WithdrawalsBoard } from "./withdrawals-board";

export const dynamic = "force-dynamic";

// Only the boss answers these, so they aren't in the all-staff queue on Wallets.
export default async function AgentWithdrawalsPage() {
  const session = await getDashboardSession();
  if (!sessionCan(session, "agents", "manage")) redirect("/dashboard/agents");
  const [withdrawals, accounts] = await Promise.all([listOpenAgentWithdrawals(), listMoneyAccounts()]);
  return (
    <div className="space-y-6">
      <SectionLabel>Agents</SectionLabel>
      <AgentTabs boss />
      <WithdrawalsBoard withdrawals={withdrawals} accounts={accounts.ok ? accounts.data ?? [] : []} />
    </div>
  );
}
