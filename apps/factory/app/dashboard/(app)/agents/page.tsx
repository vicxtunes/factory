import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { listAgentsWithFigures, payFirstForAll } from "@repo/lib/agents/server";
import { pageAccess, sessionCan } from "@repo/lib/auth/session";

import { AgentTabs } from "./agent-tabs";
import { AgentsBoard } from "./agents-board";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const session = await pageAccess("agents");
  const boss = sessionCan(session, "agents", "manage");

  return (
    <div className="space-y-6">
      <SectionLabel>Agents</SectionLabel>
      <AgentTabs boss={boss} />
      <Loading skeleton={<RowsSkeleton />}>
        <Agents boss={boss} />
      </Loading>
    </div>
  );
}

async function Agents({ boss }: { boss: boolean }) {
  const [agents, payFirst] = await Promise.all([listAgentsWithFigures(), payFirstForAll()]);
  return <AgentsBoard agents={agents} boss={boss} payFirstForAll={payFirst} />;
}
