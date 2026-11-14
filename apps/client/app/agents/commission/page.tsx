import { RelockAt, WalletLock } from "@repo/ui/wallet/WalletPin";
import { weeklyPayWhen } from "@repo/lib/agents/core";
import { agentOrders, feePaidBy, weeklyPay } from "@repo/lib/agents/server";
import { formatMoney } from "@repo/lib/currency/format";
import { getMyPhone } from "@repo/lib/wallet/actions";
import { agentWallet, storedPin, unlockedUntil } from "@repo/lib/wallet/agent";
import { MIN_WITHDRAWAL, localPhone } from "@repo/lib/wallet/policy";

import { requireAgent } from "../agent";
import { AgentFrame } from "../frame";
import { CommissionView } from "./commission-view";

export const metadata = { title: "Commission" };

// Balance, what each order earned, and withdrawals, behind their wallet PIN as a vendor's wallet is.
export default async function AgentCommissionPage() {
  const { session, agent } = await requireAgent();
  const until = await unlockedUntil(session.client_id);
  if (!until) {
    return (
      <AgentFrame agent={agent} page="commission">
        <WalletLock hasPin={!!(await storedPin(session.client_id))} label="Commission" />
      </AgentFrame>
    );
  }
  const [wallet, orders, phone, paidBy, weekly] = await Promise.all([agentWallet(agent.id), agentOrders(agent.id), getMyPhone(), feePaidBy(), weeklyPay()]);
  // Paid by itself each week to the number agreed with Aming, when the boss has it on.
  const weeklyLine =
    weekly.on && agent.payoutPhone && agent.active
      ? `${weeklyPayWhen(weekly)}, your balance is sent to ${localPhone(agent.payoutPhone)} by itself when it's at least ${formatMoney(Math.max(weekly.min, MIN_WITHDRAWAL))}. Commission earned in the last 7 days goes the week after.`
      : null;
  return (
    <AgentFrame agent={agent} page="commission">
      <RelockAt until={until} />
      <CommissionView wallet={wallet} orders={orders} phone={phone.ok ? phone.data ?? null : null} feePaidBy={paidBy} canWithdraw={agent.active} weeklyLine={weeklyLine} />
    </AgentFrame>
  );
}
