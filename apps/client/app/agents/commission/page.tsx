import { RelockAt, WalletLock } from "@repo/ui/wallet/WalletPin";
import { agentOrders, feePaidBy } from "@repo/lib/agents/server";
import { getMyPhone } from "@repo/lib/wallet/actions";
import { agentWallet, storedPin, unlockedUntil } from "@repo/lib/wallet/agent";

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
  const [wallet, orders, phone, paidBy] = await Promise.all([agentWallet(agent.id), agentOrders(agent.id), getMyPhone(), feePaidBy()]);
  return (
    <AgentFrame agent={agent} page="commission">
      <RelockAt until={until} />
      <CommissionView wallet={wallet} orders={orders} phone={phone.ok ? phone.data ?? null : null} feePaidBy={paidBy} canWithdraw={agent.active} />
    </AgentFrame>
  );
}
