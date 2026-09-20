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
}

export async function getWorkerSession(): Promise<WorkerSession | null> {
  const store = await cookies();
  const session = await verifyPayload<WorkerSession>(store.get(WORKER_COOKIE)?.value);
  if (!session?.worker_id) return null;

  // Confirm the worker still exists and is active.
  const admin = createAdminClient();
  const { data } = await admin
    .from("workers")
    .select("id, active")
    .eq("id", session.worker_id)
    .maybeSingle();
  if (!data || data.active === false) return null;
  return session;
}

export interface DesignerSession {
  designer_id: string;
  name: string;
}

export async function getDesignerSession(): Promise<DesignerSession | null> {
  const store = await cookies();
  const session = await verifyPayload<DesignerSession>(store.get(DESIGNER_COOKIE)?.value);
  if (!session?.designer_id) return null;

  // Confirm the designer still exists and is active.
  const admin = createAdminClient();
  const { data } = await admin
    .from("designers")
    .select("id, active")
    .eq("id", session.designer_id)
    .maybeSingle();
  if (!data || data.active === false) return null;
  return session;
}

export interface ClientSession {
  client_id: string;
  name: string;
}

// The signed-in Supabase Auth user, if they signed in with Google. Dashboard
// staff also hold Supabase sessions (email + password) — those are excluded
// here so a staff login can never be mistaken for a client identity.
export interface GoogleIdentity {
  userId: string;
  email: string | null;
  name: string | null;
}

export async function getGoogleIdentity(): Promise<GoogleIdentity | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.identities?.some((i) => i.provider === "google")) return null;
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  return {
    userId: user.id,
    email: user.email ?? null,
    name: meta.full_name ?? meta.name ?? null,
  };
}

// Two ways to be a signed-in client: the phone/PIN cookie, or a Google
// identity linked to a client row (client_identities). The cookie wins when
// both exist; linking a Google account clears it (see linkGoogleAccount).
export async function getClientSession(): Promise<ClientSession | null> {
  const store = await cookies();
  const session = await verifyPayload<ClientSession>(store.get(CLIENT_COOKIE)?.value);
  const admin = createAdminClient();

  if (session?.client_id) {
    // Confirm the client still exists and is active.
    const { data } = await admin
      .from("clients")
      .select("id, active")
      .eq("id", session.client_id)
      .maybeSingle();
    if (!data || data.active === false) return null;
    return session;
  }

  const google = await getGoogleIdentity();
  if (!google) return null;
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
