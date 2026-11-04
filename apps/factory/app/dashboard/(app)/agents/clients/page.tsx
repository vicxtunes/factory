import { redirect } from "next/navigation";

import { SectionLabel } from "@repo/ui/SectionLabel";
import { pendingClientMatches } from "@repo/lib/agents/server";
import { getDashboardSession } from "@repo/lib/auth/session";
import { isManagerRole } from "@repo/lib/types";

import { AgentTabs } from "../agent-tabs";
import { ClientMatches } from "./client-matches";

export const dynamic = "force-dynamic";

export default async function AgentClientMatchesPage() {
  const session = await getDashboardSession();
  if (!session || !isManagerRole(session.role)) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <SectionLabel>Agents</SectionLabel>
      <AgentTabs boss={session.role === "boss"} />
      <ClientMatches matches={await pendingClientMatches()} />
    </div>
  );
}
