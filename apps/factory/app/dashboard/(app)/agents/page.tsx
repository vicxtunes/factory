import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { listAgentsWithFigures } from "@repo/lib/agents/server";
import { getDashboardSession } from "@repo/lib/auth/session";
import { isManagerRole } from "@repo/lib/types";

import { AgentTabs } from "./agent-tabs";
import { AgentsBoard } from "./agents-board";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");
  const boss = session.role === "boss";

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
  return <AgentsBoard agents={await listAgentsWithFigures()} boss={boss} />;
}
