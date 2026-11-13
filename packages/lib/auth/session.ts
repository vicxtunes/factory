import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@repo/lib/supabase/server";
import { createAdminClient } from "@repo/lib/supabase/admin";
import type { AppRole } from "@repo/lib/types";
import { can, resolveAccess, type Access, type Level, type Section } from "@repo/lib/staff-access/core";
import { DESIGNER_COOKIE, WORKER_COOKIE, verifyPayload } from "@repo/lib/auth/cookies";

// Each getter is wrapped in React's cache(): the layout, the page and any
// helper that asks for the session in the same request share one lookup
// instead of each going to Supabase again.

export interface WorkerSession {
  worker_id: string;
  name: string;
  avatarUrl: string | null;
}

export const getWorkerSession = cache(async (): Promise<WorkerSession | null> => {
  const store = await cookies();
  const session = await verifyPayload<{ worker_id: string }>(store.get(WORKER_COOKIE)?.value);
  if (!session?.worker_id) return null;

  // Confirm the worker still exists and is active. name/avatar are read
  // fresh here rather than trusted from the (login-time) cookie payload, so
  // a profile edit (see packages/lib/profile/actions.ts) shows up immediately
  // instead of only after the next sign-in.
  const admin = createAdminClient();
  const { data } = await admin
    .from("workers")
    .select("id, name, avatar_url, active")
    .eq("id", session.worker_id)
    .maybeSingle();
  if (!data || data.active === false) return null;
  return { worker_id: data.id, name: data.name, avatarUrl: data.avatar_url };
});

export interface DesignerSession {
  designer_id: string;
  name: string;
  avatarUrl: string | null;
}

export const getDesignerSession = cache(async (): Promise<DesignerSession | null> => {
  const store = await cookies();
  const session = await verifyPayload<{ designer_id: string }>(store.get(DESIGNER_COOKIE)?.value);
  if (!session?.designer_id) return null;

  // Confirm the designer still exists and is active — see getWorkerSession's
  // comment on reading name/avatar fresh rather than from the cookie.
  const admin = createAdminClient();
  const { data } = await admin
    .from("designers")
    .select("id, name, avatar_url, active")
    .eq("id", session.designer_id)
    .maybeSingle();
  if (!data || data.active === false) return null;
  return { designer_id: data.id, name: data.name, avatarUrl: data.avatar_url };
});

export interface ClientSession {
  client_id: string;
  name: string;
  avatarUrl: string | null;
}

// Clients sign in with Supabase Auth (emailed one-time code — see
// apps/client/app/actions.ts), so their session is the standard Supabase JWT,
// verified locally like the dashboard's. The auth user is tied to its clients
// row through client_identities.
export const getClientSession = cache(async (): Promise<ClientSession | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  // Confirm the client still exists and is active — see getWorkerSession's
  // comment on reading name/avatar fresh.
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("client_identities")
    .select("client:clients!inner (id, name, avatar_url, active)")
    .eq("auth_user_id", claims.sub)
    .maybeSingle<{ client: { id: string; name: string; avatar_url: string | null; active: boolean } }>();
  const client = link?.client;
  if (!client || client.active === false) return null;
  return { client_id: client.id, name: client.name, avatarUrl: client.avatar_url };
});

export interface DashboardSession {
  userId: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: AppRole;
  /** The boss: everything, and Team & access. */
  isBoss: boolean;
  /** Their role's name ("Boss" for the boss). */
  roleName: string;
  /** Every dashboard section and how far they reach it (packages/lib/staff-access). */
  access: Access;
}

interface ProfileRow {
  role: AppRole;
  full_name: string | null;
  avatar_url: string | null;
  staff_role_id: string | null;
  access_overrides: unknown;
  suspended_at: string | null;
}

// Returns the dashboard session or null (does not redirect).
// getClaims() verifies the access token locally (with the project's
// asymmetric signing keys) instead of asking Supabase Auth on every request.
// A deleted user's token stays valid until it expires, but deleting a user
// cascades to their profiles row, so the check below still locks them out;
// a suspended one (Team & access) is locked out the same way, at once.
export const getDashboardSession = cache(async (): Promise<DashboardSession | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, avatar_url, staff_role_id, access_overrides, suspended_at")
    .eq("id", claims.sub)
    .maybeSingle<ProfileRow>();
  // A Supabase Auth user with no matching profiles row (deleted out from
  // under them, or created outside this app's own createAdminUser, which
  // always inserts both atomically) has no assigned role — treat as not
  // signed in rather than defaulting to any access.
  if (!profile || profile.suspended_at) return null;

  const isBoss = profile.role === "boss";
  const staffRole =
    isBoss || !profile.staff_role_id
      ? null
      : (
          await createAdminClient()
            .from("staff_roles")
            .select("name, access")
            .eq("id", profile.staff_role_id)
            .maybeSingle<{ name: string; access: unknown }>()
        ).data;
  return {
    userId: claims.sub,
    email: claims.email ?? null,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    role: profile.role,
    isBoss,
    roleName: isBoss ? "Boss" : (staffRole?.name ?? "No role"),
    // No role (it can't be deleted while used, so only by hand): only their own sections.
    access: resolveAccess(isBoss, staffRole?.access, profile.access_overrides),
  };
});

// Use in dashboard server actions/pages. Redirects to login when unauthenticated.
export async function requireDashboard(): Promise<DashboardSession> {
  const session = await getDashboardSession();
  if (!session) redirect("/dashboard/login");
  return session;
}

/** Whether this session reaches `section` at `level` (view by default). */
export function sessionCan(session: DashboardSession | null, section: Section, level: Exclude<Level, "none"> = "view"): session is DashboardSession {
  return !!session && can(session.access, section, level);
}

/** For server actions: the session, if it reaches `section` at `level` (manage by default). */
export async function requireAccess(section: Section, level: Exclude<Level, "none"> = "manage"): Promise<DashboardSession> {
  const session = await requireDashboard();
  if (!can(session.access, section, level)) throw new Error("You don't have access to this. Ask the boss.");
  return session;
}

/** For pages: back to the dashboard unless this session reaches `section` (view by default). */
export async function pageAccess(section: Section, level: Exclude<Level, "none"> = "view"): Promise<DashboardSession> {
  const session = await requireDashboard();
  if (!can(session.access, section, level)) redirect("/dashboard");
  return session;
}

/** Team & access: the boss's alone, never given. */
export async function requireBoss(): Promise<DashboardSession> {
  const session = await requireDashboard();
  if (!session.isBoss) throw new Error("Only the boss can do this.");
  return session;
}

// Media upload/session actions are called from the dashboard (Supabase Auth,
// order intake + "add more photos"), from /graphics (designer PIN session,
// attaching design files), from /factory (worker PIN session, attaching
// finished-item photos), and from the client portal (client session, viewing/
// downloading their own item's photos) — any signed-in surface may attach
// or read photos; ownership of *which* item is enforced by each caller.
export async function requireMediaUploadAccess(): Promise<void> {
  if (await getDashboardSession()) return;
  if (await getDesignerSession()) return;
  if (await getWorkerSession()) return;
  if (await getClientSession()) return;
  throw new Error("Not signed in.");
}
