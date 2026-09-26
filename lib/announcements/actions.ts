"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardSession } from "@/lib/auth/session";
import { resolveActor } from "@/lib/audit/log";
import type { Announcement, AuditActorType } from "@/lib/types";

import { canManageAnnouncements } from "./access";

type Result = { ok: true } | { ok: false; error: string };

// The boss (and the developer account) manage announcements — see ./access.ts.
async function requireManager(): Promise<void> {
  const session = await getDashboardSession();
  if (!canManageAnnouncements(session)) {
    throw new Error("Forbidden: only the boss can manage announcements");
  }
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
      .select("id, title, body, audience, active, created_by_name, created_at")
      .eq("active", true)
      .order("created_at", { ascending: true }),
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
  await requireManager();
  const validated = validateAnnouncementInput(input);
  if ("error" in validated) return { ok: false, error: validated.error };

  const session = await getDashboardSession();
  const admin = createAdminClient();
  const { error } = await admin.from("announcements").insert({
    title: validated.title,
    body: validated.body,
    audience: input.audience,
    created_by_name: session?.fullName || session?.email || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidateAnnouncementViews();
  return { ok: true };
}

export async function updateAnnouncement(
  id: string,
  input: { title: string; body: string; audience: AuditActorType[] },
): Promise<Result> {
  await requireManager();
  const validated = validateAnnouncementInput(input);
  if ("error" in validated) return { ok: false, error: validated.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("announcements")
    .update({ title: validated.title, body: validated.body, audience: input.audience })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAnnouncementViews();
  return { ok: true };
}

export async function setAnnouncementActive(id: string, active: boolean): Promise<Result> {
  await requireManager();
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
  await requireManager();
  const admin = createAdminClient();
  const { error } = await admin.from("announcements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAnnouncementViews();
  return { ok: true };
}
