import "server-only";

// The studio service wired to this app's store, and how pages and other
// modules' actions find the caller's studio. Import from here.
//
// The caller is the studio's owner, or one of its team who joined with their
// own account (packages/lib/team): each page and action says what it needs
// (an area, "anyone" on the team, or nothing: owner-only), so a member reaches
// only what they were given. Owner-only is the default, so a new page or
// action stays the owner's until it says otherwise.

import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getClientSession, getDashboardSession, type ClientSession, type DashboardSession } from "@repo/lib/auth/session";
import { isSettingUp } from "@repo/lib/studio-access/core";
import { canUse, type Area, type StudioAccess } from "@repo/lib/team/core";
import { team } from "@repo/lib/team/server";
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
  /** The owner, or a team member with the areas they were given. */
  access: StudioAccess;
}

/** What a page or action needs: an area, or "anyone" on the team (their home, their own tasks). Nothing: owner-only. */
export type StudioNeed = Area | "anyone";

const reaches = (access: StudioAccess, need?: StudioNeed) => need === "anyone" || canUse(access, need);

/** Which business this device is working in, when its account can open more than one (`chooseStudio`). */
export const STUDIO_CHOICE_COOKIE = "studio_as";

const ownerOf = (session: ClientSession): StudioOwner => ({ clientId: session.client_id, name: session.name });

/** The businesses an account can open: its own (if it has one) and the ones it works for (active ones only). */
export const studiosOf = cache(async (clientId: string) => {
  const [owned, memberships] = await Promise.all([studios.owned(clientId), team.membershipsOf(clientId)]);
  const working = (await Promise.all(memberships.map(async (m) => ({ membership: m, studio: await studios.get(m.tenantId) })))).filter(
    (w): w is { membership: (typeof memberships)[number]; studio: NonNullable<typeof w.studio> } => w.studio?.status === "active",
  );
  return { owned, working };
});

/**
 * The signed-in client's studio, or null when signed out or studios are off.
 * One they work for when this device chose it (or they have none of their
 * own), else their own, opened on first use.
 */
const callerStudio = cache(async (): Promise<CallerStudio | null> => {
  if (!STUDIOS_ENABLED) return null;
  const session = await getClientSession();
  if (!session) return null;
  const { owned, working } = await studiosOf(session.client_id);
  const chosen = (await cookies()).get(STUDIO_CHOICE_COOKIE)?.value;
  const member = working.find((w) => w.studio.id === chosen) ?? (owned ? undefined : working[0]);
  if (member) {
    const access: StudioAccess = { owner: false, memberId: member.membership.memberId, areas: member.membership.access };
    return { session, studio: member.studio, scope: studioScope(member.studio), access };
  }
  const studio = owned ?? (await studios.open(ownerOf(session)));
  return { session, studio, scope: studioScope(studio), access: { owner: true } };
});

/**
 * For workspace pages: the caller's working studio, when the caller has what
 * the page `need`s (nothing: owner-only). Otherwise to set-up / review
 * (/studio/welcome) or a member's home (/studio). 404 while studios are off.
 * Owner and members alike get in with their Aming sign-in (an emailed code):
 * there's no second studio login.
 */
export async function requireStudio(need?: StudioNeed): Promise<CallerStudio> {
  if (!STUDIOS_ENABLED) notFound();
  const caller = await callerStudio();
  if (!caller) redirect("/");
  if (!caller.access.owner) {
    if (!reaches(caller.access, need)) redirect("/studio");
    return caller;
  }
  if (caller.studio.status !== "active") redirect("/studio/welcome");
  return caller;
}

/** For the set-up and review pages: the owner's studio, whatever its status. A team member goes to their workspace. */
export async function requireOwnStudio(): Promise<CallerStudio> {
  if (!STUDIOS_ENABLED) notFound();
  const caller = await callerStudio();
  if (!caller) redirect("/");
  if (!caller.access.owner) redirect("/studio");
  return caller;
}

/**
 * For studio actions (this module's and others'): the caller's working
 * studio when they have what the action `need`s (nothing: owner-only), else
 * a StudioError.
 */
export async function studioOfCaller(need?: StudioNeed): Promise<CallerStudio> {
  const caller = await callerStudio();
  if (!caller) throw new StudioError("Sign in to manage your business.");
  if (!caller.access.owner) {
    if (!reaches(caller.access, need)) throw new StudioError("You don't have access to this part of the business. Ask its owner.");
    return caller;
  }
  if (caller.studio.status !== "active") throw new StudioError("Your business isn't open yet: finish setting it up and wait for Aming's approval.");
  return caller;
}

/**
 * For actions that are part of setting up (the address, the logo): the
 * caller's studio while it's being set up, or once it works.
 */
export async function studioForSetup(): Promise<CallerStudio> {
  const caller = await callerStudio();
  if (!caller) throw new StudioError("Sign in to manage your business.");
  if (!caller.access.owner) throw new StudioError("Only the business's owner can do this.");
  return isSettingUp(caller.studio.status) ? caller : studioOfCaller();
}

/** For the set-up actions: the caller's studio, whatever its status. */
export async function ownStudio(): Promise<CallerStudio> {
  const caller = await callerStudio();
  if (!caller) throw new StudioError("Sign in to manage your business.");
  if (!caller.access.owner) throw new StudioError("Only the business's owner can do this.");
  return caller;
}

/** For the boss's studio pages: the signed-in boss, else back to the dashboard. */
export async function requireStudiosOversight(): Promise<DashboardSession> {
  const session = await getDashboardSession();
  if (!session || !canViewAllStudios(session.role)) redirect("/dashboard");
  return session;
}
