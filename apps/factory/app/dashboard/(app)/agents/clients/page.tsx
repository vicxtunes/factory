import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { allAgentClients, listAgents, pendingClientMatches } from "@repo/lib/agents/server";
import { getDashboardSession } from "@repo/lib/auth/session";
import { isManagerRole } from "@repo/lib/types";

import { AgentTabs } from "../agent-tabs";
import { AgentClientsBoard } from "./agent-clients-board";
import { ClientMatches } from "./client-matches";

export const dynamic = "force-dynamic";

// Agents' clients: registrations to check first, then everyone on an agent's list.
export default async function AgentClientsPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");
  const [matches, clients, agents] = await Promise.all([pendingClientMatches(), allAgentClients(), listAgents()]);
  return (
    <div className="space-y-6">
      <SectionLabel>Agents</SectionLabel>
      <AgentTabs boss={session.role === "boss"} />
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">To check</h2>
          <p className="text-xs text-muted">Agents registered these people with a phone or email already on Aming.</p>
        </div>
        <ClientMatches matches={matches} />
      </section>
      <AgentClientsBoard clients={clients} agents={agents.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))} boss={session.role === "boss"} />
    </div>
  );
}
