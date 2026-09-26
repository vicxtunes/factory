"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardSession } from "@/lib/auth/session";
import { resolveActor } from "@/lib/audit/log";
import type { Announcement, AuditActorType } from "@/lib/types";

import { notifyActor } from "@/lib/push/send";

import { approvalOnSave, canApproveAnnouncements, canCreateAnnouncements, canManageAnnouncement } from "./access";

type Result = { ok: true } | { ok: false; error: string };

// Any dashboard user may create; only an announcement's creator may change
// it (./access.ts).
async function requireCreator(): Promise<NonNullable<Awaited<ReturnType<typeof getDashboardSession>>>> {
  const session = await getDashboardSession();
  if (!session || !canCreateAnnouncements(session)) throw new Error("Forbidden");
  return session;
}

/** Null if the announcement is the caller's own; otherwise the reason it isn't editable. */
async function ownershipError(id: string, session?: Awaited<ReturnType<typeof requireCreator>>): Promise<string | null> {
  session ??= await requireCreator();
  const { data } = await createAdminClient().from("announcements").select("created_by_id").eq("id", id).maybeSingle();
  if (!data) return "Announcement not found.";
  if (!canManageAnnouncement(session, data)) return "Only the person who created this announcement can change it.";
  return null;
}

// The next announcement this signed-in actor hasn't dismissed yet, targeted
// at them (audience empty = everyone) — or null if there's nothing to show,
// including when nobody's signed in at all (an anonymous showroom visitor
// gets no popup). Oldest-undismissed-first, not newest, so dismissing one
// reveals the next in publish order rather than jumping around.
export async function getActiveAnnouncement(): Promise<Announcement | null> {
  const actor = await resolveActor();
  if (!actor) return null;

  const admin = createAdminClient();
  const [{ data: announcements }, { data: dismissals }] = await Promise.all([
    admin
      .from("announcements")
      .select("id, title, body, audience, active, created_by_id, created_by_name, created_at, approval_status, approved_at, decided_by_name")
      .eq("active", true)
      .eq("approval_status", "approved")
      .order("approved_at", { ascending: true }),
    admin
      .from("announcement_dismissals")
      .select("announcement_id")
      .eq("actor_type", actor.type)
      .eq("actor_id", actor.id),
  ]);

  const dismissedIds = new Set((dismissals ?? []).map((d) => d.announcement_id));
  const candidate = (announcements ?? []).find(
    (a) => !dismissedIds.has(a.id) && (a.audience.length === 0 || a.audience.includes(actor.type)),
  );
  return (candidate as Announcement) ?? null;
}

// Records that this actor has seen it — upsert (not insert) because a
// double-click or a second tab racing the same dismiss shouldn't surface a
// duplicate-key error to the user; either way the outcome is identical.
export async function dismissAnnouncement(announcementId: string): Promise<Result> {
  const actor = await resolveActor();
  if (!actor) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin.from("announcement_dismissals").upsert(
    { announcement_id: announcementId, actor_type: actor.type, actor_id: actor.id },
    { onConflict: "announcement_id,actor_type,actor_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function nameOf(session: { fullName?: string | null; email?: string | null }): string | null {
  return session.fullName || session.email || null;
}

/** Status columns for a create/edit by this person: live for the boss, pending otherwise. */
function approvalFields(session: Awaited<ReturnType<typeof requireCreator>>) {
  const status = approvalOnSave(session);
  return {
    approval_status: status,
    approved_at: status === "approved" ? new Date().toISOString() : null,
    decided_by_name: status === "approved" ? nameOf(session) : null,
  };
}

/** Push to every boss that an announcement is waiting for them. */
async function notifyBossesOfPending(authorName: string | null, title: string): Promise<void> {
  const { data } = await createAdminClient().from("profiles").select("id").eq("role", "boss");
  await Promise.all(
    (data ?? []).map((b) =>
      notifyActor(
        { type: "dashboard_user", id: b.id as string },
        {
          title: "Announcement awaiting approval",
          body: `${authorName ?? "Someone"}: "${title}"`,
          url: "/dashboard/announcements",
        },
      ),
    ),
  );
}

function revalidateAnnouncementViews(): void {
  revalidatePath("/dashboard/announcements");
}

function validateAnnouncementInput(input: {
  title: string;
  body: string;
}): { title: string; body: string } | { error: string } {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { error: "Title is required." };
  if (!body) return { error: "Message is required." };
  return { title, body };
}

export async function createAnnouncement(input: {
  title: string;
  body: string;
  audience: AuditActorType[];
}): Promise<Result> {
  const session = await requireCreator();
  const validated = validateAnnouncementInput(input);
  if ("error" in validated) return { ok: false, error: validated.error };

  const admin = createAdminClient();
  const { error } = await admin.from("announcements").insert({
    title: validated.title,
    body: validated.body,
    audience: input.audience,
    created_by_id: session.userId,
    created_by_name: nameOf(session),
    ...approvalFields(session),
  });
  if (error) return { ok: false, error: error.message };
  revalidateAnnouncementViews();
  if (approvalOnSave(session) === "pending") await notifyBossesOfPending(nameOf(session), validated.title);
  return { ok: true };
}

// Editing sends someone else's announcement back to the boss for approval
// (the boss's own edits stay approved).
export async function updateAnnouncement(
  id: string,
  input: { title: string; body: string; audience: AuditActorType[] },
): Promise<Result> {
  const session = await requireCreator();
  const denied = await ownershipError(id, session);
  if (denied) return { ok: false, error: denied };
  const validated = validateAnnouncementInput(input);
  if ("error" in validated) return { ok: false, error: validated.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("announcements")
    .update({ title: validated.title, body: validated.body, audience: input.audience, ...approvalFields(session) })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAnnouncementViews();
  if (approvalOnSave(session) === "pending") await notifyBossesOfPending(nameOf(session), validated.title);
  return { ok: true };
}

/**
 * The boss approves (it goes live) or rejects a pending announcement. The
 * boss can't edit someone else's announcement, only decide on it. The
 * creator is told either way.
 */
export async function decideAnnouncement(id: string, approve: boolean): Promise<Result> {
  const session = await getDashboardSession();
  if (!canApproveAnnouncements(session)) return { ok: false, error: "Only the boss can approve announcements." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .update({
      approval_status: approve ? "approved" : "rejected",
      approved_at: approve ? new Date().toISOString() : null,
      decided_by_name: nameOf(session!),
    })
    .eq("id", id)
    .eq("approval_status", "pending")
    .select("title, created_by_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "This announcement is no longer waiting for approval." };
  revalidateAnnouncementViews();

  if (data.created_by_id) {
    await notifyActor(
      { type: "dashboard_user", id: data.created_by_id },
      {
        title: approve ? "Announcement approved" : "Announcement not approved",
        body: approve ? `"${data.title}" is now live.` : `"${data.title}" was not approved. You can edit and resubmit it.`,
        url: "/dashboard/announcements",
      },
    );
  }
  return { ok: true };
}

export async function setAnnouncementActive(id: string, active: boolean): Promise<Result> {
  const denied = await ownershipError(id);
  if (denied) return { ok: false, error: denied };
  const admin = createAdminClient();
  const { error } = await admin.from("announcements").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAnnouncementViews();
  return { ok: true };
}

// The dismissal rows cascade-delete with it (see the migration's `on delete
// cascade`) — nobody's left with a stale "seen" record for a message that
// no longer exists.
export async function deleteAnnouncement(id: string): Promise<Result> {
  const denied = await ownershipError(id);
  if (denied) return { ok: false, error: denied };
  const admin = createAdminClient();
  const { error } = await admin.from("announcements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAnnouncementViews();
  return { ok: true };
}
