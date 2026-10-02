import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { fetchAgents } from "@repo/lib/queries";
import { getDashboardSession } from "@repo/lib/auth/session";
import { isManagerRole } from "@repo/lib/types";

import { AgentPanel } from "../../agent-panel";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");

  const agents = await fetchAgents();

  return (
    <div className="space-y-6">
      <SectionLabel>Agents</SectionLabel>
      <AgentPanel agents={agents} />
    </div>
  );
}
