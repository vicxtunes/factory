"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardSession, requireMediaUploadAccess } from "@/lib/auth/session";
import { resolveActor } from "@/lib/audit/log";
import { chatHref } from "@/lib/chat/routes";
import * as chat from "@/lib/chat/issues";
import { notifyActor } from "@/lib/push/send";
import type { SupportReport } from "@/lib/types";

import { SUPPORT_OWNER_EMAIL } from "./constants";
import { reportSnippet } from "./notices";

// Each report also has a private chat thread (kind "issue") between the
// reporter and the owner, where they talk it through. The report row stays
// the source of truth for Open/Resolved; the chat module only displays it
// and gets told when it changes (announceIssueStatus).

type Result<T = undefined> = ({ ok: true } & (T extends undefined ? unknown : { data: T })) | { ok: false; error: string };

async function requireOwner(): Promise<{ userId: string; name: string }> {
  const session = await getDashboardSession();
  if (!session || session.email !== SUPPORT_OWNER_EMAIL) {
    throw new Error("Forbidden: owner only");
  }
  return { userId: session.userId, name: session.fullName || session.email || "Developer" };
}

/** Adds each report's chat thread id, for "Open chat" links. */
async function withThreads(reports: SupportReport[]): Promise<SupportReport[]> {
  const threads = await chat.issueThreadIds(reports.map((r) => r.id)).catch(() => new Map<string, string>());
  return reports.map((r) => ({ ...r, chat_conversation_id: threads.get(r.id) ?? null }));
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
// Returns the new report's chat thread id (null if the thread couldn't be
// made — the report itself is still saved and reaches the owner).
export async function submitSupportReport(body: string): Promise<Result<{ conversationId: string | null }>> {
  await requireMediaUploadAccess();
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Please describe what's wrong or missing." };

  const actor = await resolveActor();
  if (!actor) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: report, error } = await admin
    .from("support_reports")
    .insert({
      author_type: actor.type,
      author_id: actor.id,
      author_name: actor.name,
      author_role: actor.role ?? null,
      body: trimmed,
    })
    .select("id")
    .single();
  if (error || !report) return { ok: false, error: error?.message ?? "Couldn't save the report." };

  const ownerId = await resolveOwnerUserId();
  let conversationId: string | null = null;
  try {
    conversationId = await chat.createIssueThread({
      reportId: report.id,
      reporter: { type: actor.type as "dashboard_user" | "worker" | "designer", id: actor.id, name: actor.name },
      body: trimmed,
      developer: ownerId ? { type: "dashboard_user", id: ownerId } : null,
    });
  } catch (err) {
    console.error("support report chat thread failed:", err);
  }

  // Awaited (not fire-and-forget): on serverless (Vercel) the function can
  // be frozen the instant the response is sent, which would silently drop
  // an un-awaited push send. notifyActor() itself never throws.
  if (ownerId) {
    await notifyActor(
      { type: "dashboard_user", id: ownerId },
      {
        title: "New support report",
        body: `${actor.name}: ${trimmed.slice(0, 120)}`,
        url: conversationId ? chatHref(conversationId) : "/dashboard/support",
      },
    );
  }
  return { ok: true, data: { conversationId } };
}

export async function getSupportReports(): Promise<SupportReport[]> {
  await requireOwner();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_reports")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return withThreads((data ?? []) as SupportReport[]);
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
  return withThreads((data ?? []) as SupportReport[]);
}

/**
 * The owner's way into a report's chat thread from /dashboard/support: joins
 * it if needed, or creates it for a report that somehow has none.
 */
export async function openSupportReportChat(id: string): Promise<Result<{ conversationId: string }>> {
  const owner = await requireOwner();
  const developer = { type: "dashboard_user" as const, id: owner.userId };
  const existing = await chat.joinIssueThread(id, developer);
  if (existing) return { ok: true, data: { conversationId: existing } };

  const { data: report } = await createAdminClient().from("support_reports").select("*").eq("id", id).maybeSingle<SupportReport>();
  if (!report) return { ok: false, error: "Report not found." };
  const conversationId = await chat.createIssueThread({
    reportId: report.id,
    reporter: { type: report.author_type as "dashboard_user" | "worker" | "designer", id: report.author_id, name: report.author_name },
    body: report.body,
    developer,
  });
  return { ok: true, data: { conversationId } };
}

export async function setSupportReportStatus(id: string, resolved: boolean): Promise<Result> {
  const owner = await requireOwner();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("support_reports")
    .update({ status: resolved ? "resolved" : "open", resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id)
    .select("author_type, author_id, body")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/support");

  await chat.announceIssueStatus(id, resolved, owner.name).catch((err) => console.error("issue status note failed:", err));

  // Only the person who raised it is told, and the push opens the issue's
  // chat. They also see it in their bell for a while (lib/support/notices.ts),
  // in case push is off.
  if (resolved && data) {
    const threads = await chat.issueThreadIds([id]).catch(() => new Map<string, string>());
    const thread = threads.get(id);
    await notifyActor(
      { type: data.author_type, id: data.author_id },
      {
        title: "Your issue was resolved",
        body: `"${reportSnippet(data.body)}" was marked as resolved.`,
        url: thread ? chatHref(thread) : "/support",
      },
    );
  }
  return { ok: true };
}

export async function deleteSupportReport(id: string): Promise<Result> {
  await requireOwner();
  // The chat thread goes with the report (foreign key cascade); its files don't.
  await chat.removeIssueThreadFiles(id).catch((err) => console.error("issue thread cleanup failed:", err));
  const admin = createAdminClient();
  const { error } = await admin.from("support_reports").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/support");
  return { ok: true };
}
