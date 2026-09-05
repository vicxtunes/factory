import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole, Profile } from "@/lib/types";
import {
  INTAKE_COOKIE,
  WORKER_COOKIE,
  verifyPayload,
} from "@/lib/auth/cookies";

export interface WorkerSession {
  worker_id: string;
  name: string;
}

export async function getIntakeSession(): Promise<boolean> {
  const store = await cookies();
  const payload = await verifyPayload<{ ok: true }>(store.get(INTAKE_COOKIE)?.value);
  return payload?.ok === true;
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
