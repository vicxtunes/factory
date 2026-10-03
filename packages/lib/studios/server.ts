import "server-only";

// The studio service wired to this app's store, and how pages and other
// modules' actions find the caller's studio. Import from here.

import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import { getClientSession, getDashboardSession, type ClientSession, type DashboardSession } from "@repo/lib/auth/session";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { supabaseStudioStore } from "./adapters/supabase/store";
import { studioScope, type Studio, type StudioOwner } from "./core";
import { STUDIOS_ENABLED } from "./feature";
import { canViewAllStudios } from "./policy";
import { StudioError } from "./ports";
import { StudioService } from "./service";

export const studios = new StudioService(supabaseStudioStore);

export interface CallerStudio {
  session: ClientSession;
  studio: Studio;
  /** Pass this to every studio-owned module (customers, …). */
  scope: TenantScope;
}

const ownerOf = (session: ClientSession): StudioOwner => ({ clientId: session.client_id, name: session.name });

/** The signed-in client's studio (opened on first use), or null when signed out or studios are off. */
const callerStudio = cache(async (): Promise<CallerStudio | null> => {
  if (!STUDIOS_ENABLED) return null;
  const session = await getClientSession();
  if (!session) return null;
  const studio = await studios.open(ownerOf(session));
  return { session, studio, scope: studioScope(studio) };
});

/** For studio pages: the caller's studio, else the portal home. 404 while studios are off. */
export async function requireStudio(): Promise<CallerStudio> {
  if (!STUDIOS_ENABLED) notFound();
  const caller = await callerStudio();
  if (!caller) redirect("/");
  return caller;
}

/** For studio actions (this module's and others'): the caller's studio, else a StudioError. */
export async function studioOfCaller(): Promise<CallerStudio> {
  const caller = await callerStudio();
  if (!caller) throw new StudioError("Sign in to manage your studio.");
  return caller;
}

/** For the boss's studio pages: the signed-in boss, else back to the dashboard. */
export async function requireStudiosOversight(): Promise<DashboardSession> {
  const session = await getDashboardSession();
  if (!session || !canViewAllStudios(session.role)) redirect("/dashboard");
  return session;
}
