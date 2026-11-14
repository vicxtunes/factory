import { SectionLabel } from "@repo/ui/SectionLabel";
import { allAgentClients, listAgents, pendingClientMatches } from "@repo/lib/agents/server";
import { pageAccess, sessionCan } from "@repo/lib/auth/session";

import { AgentTabs } from "../agent-tabs";
import { AgentClientsBoard } from "./agent-clients-board";
import { ClientMatches } from "./client-matches";

export const dynamic = "force-dynamic";

// Agents' clients: registrations to check first, then everyone on an agent's list.
export default async function AgentClientsPage() {
  const session = await pageAccess("agents");
  const [matches, clients, agents] = await Promise.all([pendingClientMatches(), allAgentClients(), listAgents()]);
  return (
    <div className="space-y-6">
      <SectionLabel>Agents</SectionLabel>
      <AgentTabs boss={sessionCan(session, "agents", "manage")} />
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">To check</h2>
          <p className="text-xs text-muted">Agents registered these people with a phone or email already on Aming.</p>
        </div>
        <ClientMatches matches={matches} />
      </section>
      <AgentClientsBoard clients={clients} agents={agents.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))} boss={sessionCan(session, "agents", "manage")} />
    </div>
  );
}
