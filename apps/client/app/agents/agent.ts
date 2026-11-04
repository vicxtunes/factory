import "server-only";

import { redirect } from "next/navigation";

import { agentOfClient, settlePending } from "@repo/lib/agents/server";
import { getClientSession } from "@repo/lib/auth/session";

/** The agent side's pages: the signed-in account and its agent. Anyone else goes to sign in, or home. */
export async function requireAgent() {
  const session = await getClientSession();
  if (!session) redirect("/?signin=1");
  const agent = await agentOfClient(session.client_id);
  if (!agent) redirect("/");
  // A commission the database couldn't work out at the time is tried again here.
  await settlePending(agent.id);
  return { session, agent };
}
