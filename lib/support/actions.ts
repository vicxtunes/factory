"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardSession, requireMediaUploadAccess } from "@/lib/auth/session";
import { resolveActor } from "@/lib/audit/log";
import { notifyActor } from "@/lib/push/send";
import type { SupportReport } from "@/lib/types";

import { SUPPORT_OWNER_EMAIL } from "./constants";

type Result = { ok: true } | { ok: false; error: string };

async function requireOwner(): Promise<void> {
  const session = await getDashboardSession();
  if (!session || session.email !== SUPPORT_OWNER_EMAIL) {
    throw new Error("Forbidden: owner only");
  }
}

// SUPPORT_OWNER_EMAIL identifies the owner, but push_subscriptions is keyed
// by dashboard-user uuid (like every other actor-model table here) — and
// `profiles` doesn't carry email, only auth.users does. Resolve through the
// same admin.auth.admin.listUsers() lookup the admins page already uses
// (app/dashboard/(app)/admins/page.tsx).
async function resolveOwnerUserId(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  return data?.users.find((u) => u.email === SUPPORT_OWNER_EMAIL)?.id ?? null;
}

// Any signed-in surface (dashboard, graphics, factory) may submit — same
// access boundary requireMediaUploadAccess() already uses elsewhere.
export async function submitSupportReport(body: string): Promise<Result> {
  await requireMediaUploadAccess();
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Please describe what's wrong or missing." };

  const actor = await resolveActor();
  if (!actor) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin.from("support_reports").insert({
    author_type: actor.type,
    author_id: actor.id,
    author_name: actor.name,
    author_role: actor.role ?? null,
    body: trimmed,
  });
  if (error) return { ok: false, error: error.message };

  // Awaited (not fire-and-forget): on serverless (Vercel) the function can
  // be frozen the instant the response is sent, which would silently drop
  // an un-awaited push send. notifyActor() itself never throws.
  const ownerId = await resolveOwnerUserId();
  if (ownerId) {
    await notifyActor(
      { type: "dashboard_user", id: ownerId },
      { title: "New support report", body: `${actor.name}: ${trimmed.slice(0, 120)}`, url: "/dashboard/support" },
    );
  }
  return { ok: true };
}

export async function getSupportReports(): Promise<SupportReport[]> {
  await requireOwner();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_reports")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as SupportReport[];
}

// Lets a reporter see the status of their own past reports (e.g. whether
// something they flagged was resolved) without owner-level access to
// everyone else's. Scoped by actor identity, not by email.
export async function getMySupportReports(): Promise<SupportReport[]> {
  const actor = await resolveActor();
  if (!actor) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_reports")
    .select("*")
    .eq("author_type", actor.type)
    .eq("author_id", actor.id)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as SupportReport[];
}

export async function setSupportReportStatus(id: string, resolved: boolean): Promise<Result> {
  await requireOwner();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_reports")
    .update({ status: resolved ? "resolved" : "open", resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id)
    .select("author_type, author_id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/support");

  if (resolved && data) {
    await notifyActor(
      { type: data.author_type, id: data.author_id },
      { title: "Your report was resolved", body: "The team marked your report as resolved.", url: "/" },
    );
  }
  return { ok: true };
}

export async function deleteSupportReport(id: string): Promise<Result> {
  await requireOwner();
  const admin = createAdminClient();
  const { error } = await admin.from("support_reports").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/support");
  return { ok: true };
}
