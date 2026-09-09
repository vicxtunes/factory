import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isManagerRole, type AppRole, type Profile } from "@/lib/types";
import {
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

export interface DashboardSession {
  userId: string;
  email: string | null;
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
    .select("role")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "role">>();

  return {
    userId: user.id,
    email: user.email ?? null,
    role: profile?.role ?? "boss",
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

// Media upload/session actions are called from the dashboard (Supabase Auth,
// order intake + "add more photos"), from /graphics (designer PIN session,
// attaching design files), and from /factory (worker PIN session, attaching
// finished-item photos) — any signed-in surface may attach photos.
export async function requireMediaUploadAccess(): Promise<void> {
  if (await getDashboardSession()) return;
  if (await getDesignerSession()) return;
  if (await getWorkerSession()) return;
  throw new Error("Not signed in.");
}
