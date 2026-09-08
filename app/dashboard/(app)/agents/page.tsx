import { redirect } from "next/navigation";

import { SectionLabel } from "@/components/ui/SectionLabel";
import { fetchAgents } from "@/lib/queries";
import { getDashboardSession } from "@/lib/auth/session";

import { AgentPanel } from "../../agent-panel";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const session = await getDashboardSession();
  if (session?.role !== "supervisor") redirect("/dashboard");

  const agents = await fetchAgents();

  return (
    <div className="space-y-6">
      <SectionLabel>Agents</SectionLabel>
      <AgentPanel agents={agents} />
    </div>
  );
}
