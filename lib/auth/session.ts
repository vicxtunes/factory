import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canManageWorkerSecurity,
  canViewOrderAudit,
  isManagerRole,
  type AppRole,
  type Profile,
} from "@/lib/types";
import {
  CLIENT_COOKIE,
  DESIGNER_COOKIE,
  WORKER_COOKIE,
  verifyPayload,
} from "@/lib/auth/cookies";

export interface WorkerSession {
  worker_id: string;
  name: string;
  avatarUrl: string | null;
}

export async function getWorkerSession(): Promise<WorkerSession | null> {
  const store = await cookies();
  const session = await verifyPayload<{ worker_id: string }>(store.get(WORKER_COOKIE)?.value);
  if (!session?.worker_id) return null;

  // Confirm the worker still exists and is active. name/avatar are read
  // fresh here rather than trusted from the (login-time) cookie payload, so
  // a profile edit (see lib/profile/actions.ts) shows up immediately
  // instead of only after the next sign-in.
  const admin = createAdminClient();
  const { data } = await admin
    .from("workers")
    .select("id, name, avatar_url, active")
    .eq("id", session.worker_id)
    .maybeSingle();
  if (!data || data.active === false) return null;
  return { worker_id: data.id, name: data.name, avatarUrl: data.avatar_url };
}

export interface DesignerSession {
  designer_id: string;
  name: string;
  avatarUrl: string | null;
}

export async function getDesignerSession(): Promise<DesignerSession | null> {
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
}

export interface ClientSession {
  client_id: string;
  name: string;
  avatarUrl: string | null;
}

export async function getClientSession(): Promise<ClientSession | null> {
  const store = await cookies();
  const session = await verifyPayload<{ client_id: string }>(store.get(CLIENT_COOKIE)?.value);
  if (!session?.client_id) return null;

  // Confirm the client still exists and is active — see getWorkerSession's
  // comment on reading name/avatar fresh rather than from the cookie.
  const admin = createAdminClient();
  const { data } = await admin
    .from("clients")
    .select("id, name, avatar_url, active")
    .eq("id", session.client_id)
    .maybeSingle();
  if (!data || data.active === false) return null;
  return { client_id: data.id, name: data.name, avatarUrl: data.avatar_url };
}

export interface DashboardSession {
  userId: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: AppRole;
}

// Returns the dashboard session or null (does not redirect).
export async function getDashboardSession(): Promise<DashboardSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "role" | "full_name" | "avatar_url">>();
  // A Supabase Auth user with no matching profiles row (deleted out from
  // under them, or created outside this app's own createAdminUser, which
  // always inserts both atomically) has no assigned role — treat as not
  // signed in rather than defaulting to any role, let alone "boss": every
  // dashboard-only gate (requireRole("boss"), isManagerRole, etc.) checks
  // `session.role`, so a silent default here would hand out that role's
  // access to an account nobody explicitly granted it to.
  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    role: profile.role,
  };
}

// Use in dashboard server actions/pages. Redirects to login when unauthenticated.
export async function requireDashboard(): Promise<DashboardSession> {
  const session = await getDashboardSession();
  if (!session) redirect("/dashboard/login");
  return session;
}

export async function requireRole(role: AppRole): Promise<DashboardSession> {
  const session = await requireDashboard();
  if (session.role !== role) {
    throw new Error(`Forbidden: requires ${role} role`);
  }
  return session;
}

// Receptionist, supervisor and boss all have full CRUD access. Boss also
// reaches the admins panel (user management), gated via requireRole("boss").
export async function requireManager(): Promise<DashboardSession> {
  const session = await requireDashboard();
  if (!isManagerRole(session.role)) {
    throw new Error("Forbidden: requires manager access");
  }
  return session;
}

// Worker login credentials — initial PIN, PIN reset, activate/deactivate.
// Receptionist keeps every other manager action; this carve-out is theirs.
export async function requireWorkerSecurity(): Promise<DashboardSession> {
  const session = await requireDashboard();
  if (!canManageWorkerSecurity(session.role)) {
    throw new Error("Forbidden: requires supervisor or boss access");
  }
  return session;
}

// The order-level "Show logs" audit trail — boss-only for now.
export async function requireOrderAudit(): Promise<DashboardSession> {
  const session = await requireDashboard();
  if (!canViewOrderAudit(session.role)) {
    throw new Error("Forbidden: requires audit access");
  }
  return session;
}

// Media upload/session actions are called from the dashboard (Supabase Auth,
// order intake + "add more photos"), from /graphics (designer PIN session,
// attaching design files), from /factory (worker PIN session, attaching
// finished-item photos), and from /client-side (client session, viewing/
// downloading their own item's photos) — any signed-in surface may attach
// or read photos; ownership of *which* item is enforced by each caller.
export async function requireMediaUploadAccess(): Promise<void> {
  if (await getDashboardSession()) return;
  if (await getDesignerSession()) return;
  if (await getWorkerSession()) return;
  if (await getClientSession()) return;
  throw new Error("Not signed in.");
}
