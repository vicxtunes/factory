import "server-only";

// The studio service wired to this app's store, and the page guards. Pages
// and actions import from here.

import { notFound, redirect } from "next/navigation";

import { getClientSession, getDashboardSession, type ClientSession, type DashboardSession } from "@repo/lib/auth/session";

import { supabaseStudioStore } from "./adapters/supabase/store";
import type { StudioOwner } from "./core";
import { STUDIOS_ENABLED } from "./feature";
import { canViewAllStudios } from "./policy";
import { StudioService } from "./service";

export const studios = new StudioService(supabaseStudioStore);

/** The studio owner behind a client session. */
export const ownerOf = (session: ClientSession): StudioOwner => ({ clientId: session.client_id, name: session.name });

/** For the client's studio pages: the signed-in client, else the portal home. 404 while studios are off. */
export async function requireStudioOwner(): Promise<ClientSession> {
  if (!STUDIOS_ENABLED) notFound();
  const session = await getClientSession();
  if (!session) redirect("/");
  return session;
}

/** For the boss's studio pages: the signed-in boss, else back to the dashboard. */
export async function requireStudiosOversight(): Promise<DashboardSession> {
  const session = await getDashboardSession();
  if (!session || !canViewAllStudios(session.role)) redirect("/dashboard");
  return session;
}
