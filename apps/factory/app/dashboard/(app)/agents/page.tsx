import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { RowsSkeleton } from "@repo/ui/skeletons/blocks";
import { Loading } from "@repo/ui/skeletons/Loading";
import { fetchAgents } from "@repo/lib/queries";
import { getDashboardSession } from "@repo/lib/auth/session";
import { isManagerRole } from "@repo/lib/types";

import { AgentPanel } from "../../agent-panel";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <SectionLabel>Agents</SectionLabel>
      <Loading skeleton={<RowsSkeleton />}>
        <Agents />
      </Loading>
    </div>
  );
}

async function Agents() {
  return <AgentPanel agents={await fetchAgents()} />;
}
