"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardSession, requireMediaUploadAccess } from "@/lib/auth/session";
import { resolveActor } from "@/lib/audit/log";
import type { SupportReport } from "@/lib/types";

import { SUPPORT_OWNER_EMAIL } from "./constants";

type Result = { ok: true } | { ok: false; error: string };

async function requireOwner(): Promise<void> {
  const session = await getDashboardSession();
  if (!session || session.email !== SUPPORT_OWNER_EMAIL) {
    throw new Error("Forbidden: owner only");
  }
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

export async function setSupportReportStatus(id: string, resolved: boolean): Promise<Result> {
  await requireOwner();
  const admin = createAdminClient();
  const { error } = await admin
    .from("support_reports")
    .update({ status: resolved ? "resolved" : "open", resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/support");
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
