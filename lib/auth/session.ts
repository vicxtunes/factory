import "server-only";

import { cache } from "react";
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

// Everyone but dashboard staff signs in with Google (Supabase Auth). The
// Google account is then linked to the record it belongs to — a worker,
// designer or client — through worker_identities / designer_identities /
// client_identities. There are no PIN or phone-only sessions any more; the old
// PIN is only used once, to prove a worker/designer's identity at link time.

// The signed-in Supabase Auth user, if they signed in with Google. Dashboard
// staff also hold Supabase sessions (email + password) — those are excluded
// here so a staff login can never be mistaken for a worker/designer/client.
// Cached per request: several session getters run per request (e.g.
// requireMediaUploadAccess tries all four) and each would otherwise make its
// own round trip to Supabase Auth.
export interface GoogleIdentity {
  userId: string;
  email: string | null;
  // Google vouches for the address. Only a verified email may be used to match
  // an existing record; an unverified one proves nothing about who they are.
  emailVerified: boolean;
  name: string | null;
}

export const getGoogleIdentity = cache(async (): Promise<GoogleIdentity | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const googleIdentity = user?.identities?.find((i) => i.provider === "google");
  if (!user || !googleIdentity) return null;
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  return {
    userId: user.id,
    email: user.email ?? null,
    emailVerified: googleIdentity.identity_data?.email_verified === true && !!user.email_confirmed_at,
    name: meta.full_name ?? meta.name ?? null,
  };
});

export interface WorkerSession {
  worker_id: string;
  name: string;
}

export async function getWorkerSession(): Promise<WorkerSession | null> {
  const google = await getGoogleIdentity();
  if (!google) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("worker_identities")
    .select("worker:workers!inner (id, name, active)")
    .eq("auth_user_id", google.userId)
    .maybeSingle<{ worker: { id: string; name: string; active: boolean } }>();
  // Deactivating a worker takes effect on their very next request.
  if (!data || data.worker.active === false) return null;
  return { worker_id: data.worker.id, name: data.worker.name };
}

export interface DesignerSession {
  designer_id: string;
  name: string;
}

export async function getDesignerSession(): Promise<DesignerSession | null> {
  const google = await getGoogleIdentity();
  if (!google) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("designer_identities")
    .select("designer:designers!inner (id, name, active)")
    .eq("auth_user_id", google.userId)
    .maybeSingle<{ designer: { id: string; name: string; active: boolean } }>();
  if (!data || data.designer.active === false) return null;
  return { designer_id: data.designer.id, name: data.designer.name };
}

export interface ClientSession {
  client_id: string;
  name: string;
}

export async function getClientSession(): Promise<ClientSession | null> {
  const google = await getGoogleIdentity();
  if (!google) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("client_identities")
    .select("client:clients!inner (id, name, active)")
    .eq("auth_user_id", google.userId)
    .maybeSingle<{ client: { id: string; name: string; active: boolean } }>();
  if (!data || data.client.active === false) return null;
  return { client_id: data.client.id, name: data.client.name };
}

export interface DashboardSession {
  userId: string;
  email: string | null;
  fullName: string | null;
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
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "role" | "full_name">>();
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
