import Link from "next/link";

import { agentClients } from "@repo/lib/agents/server";

import { requireAgent } from "../agent";
import { AgentFrame } from "../frame";
import { AddClientButton } from "./client-sheet";

export const metadata = { title: "Clients" };

const STATUS_NOTES = { pending: "Waiting for Aming to check", refused: "Not added by Aming" };

export default async function AgentClientsPage() {
  const { agent } = await requireAgent();
  const clients = await agentClients(agent.id);
  return (
    <AgentFrame agent={agent} page="clients">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Clients</h1>
          {agent.active ? <AddClientButton /> : null}
        </div>
        {clients.length ? (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {clients.map((c) =>
              c.status === "active" ? (
                <li key={c.id}>
                  <Link href={`/agents/clients/${c.clientId}`} className="block h-full rounded-2xl border border-border bg-surface p-4 shadow-theme-xs hover:bg-background">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block truncate text-sm text-muted">{c.phone ?? "No phone"}</span>
                    {c.email ? <span className="block truncate text-sm text-muted">{c.email}</span> : null}
                  </Link>
                </li>
              ) : (
                <li key={c.id} className="rounded-2xl border border-dashed border-border p-4">
                  <span className="block truncate font-semibold text-muted">{c.name}</span>
                  <span className="block truncate text-sm text-muted">{c.phone}</span>
                  <span className="mt-1 block text-xs font-medium text-warning-700 dark:text-warning-500">{STATUS_NOTES[c.status]}</span>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No clients yet. Add your first one.</p>
        )}
      </div>
    </AgentFrame>
  );
}
