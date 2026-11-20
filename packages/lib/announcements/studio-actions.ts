"use server";

// A business's own announcements (owner, 2026-11-21): written on My Business →
// Announcements by whoever manages its catalog, live at once (no Aming
// approval), and shown on its public page to its clients, once each, oldest
// first: the same logic as Aming's (./actions.ts). A client signed in on the
// page is remembered here; a visitor who isn't, in their browser.

import { revalidatePath } from "next/cache";

import { AppError, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";
import { studioOfCaller } from "@repo/lib/studios/server";
import { createAdminClient } from "@repo/lib/supabase/admin";
import type { Announcement } from "@repo/lib/types";

import { announcementFields, ANNOUNCEMENT_COLUMNS, type AnnouncementInput } from "./core";

const db = () => createAdminClient().from("announcements");

function fail(message: string): never {
  throw new AppError(message);
}

/** Every announcement of the caller's business, newest first. */
export async function myStudioAnnouncements(): Promise<Result<Announcement[]>> {
  return runAction("announcements", async () => {
    const { studio } = await studioOfCaller("catalog", "view");
    const { data, error } = await db().select(ANNOUNCEMENT_COLUMNS).eq("tenant_id", studio.id).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Announcement[];
  });
}

/** Adds one (id null) or changes one of the caller's business. */
export async function saveStudioAnnouncement(id: string | null, input: AnnouncementInput): Promise<Result> {
  return runAction("announcements", async () => {
    const { studio } = await studioOfCaller("catalog");
    const fields = announcementFields(input);
    if ("error" in fields) fail(fields.error);
    const { error, count } = id
      ? await db().update(fields, { count: "exact" }).eq("id", id).eq("tenant_id", studio.id)
      : await db().insert({ ...fields, tenant_id: studio.id, created_by_name: studio.name, approved_at: new Date().toISOString() }, { count: "exact" });
    if (error) throw error;
    if (!count) fail("That announcement is gone.");
    revalidatePath("/studio/announcements");
  });
}

export async function setStudioAnnouncementActive(id: string, active: boolean): Promise<Result> {
  return runAction("announcements", async () => {
    const { studio } = await studioOfCaller("catalog");
    const { error } = await db().update({ active }).eq("id", id).eq("tenant_id", studio.id);
    if (error) throw error;
    revalidatePath("/studio/announcements");
  });
}

export async function deleteStudioAnnouncement(id: string): Promise<Result> {
  return runAction("announcements", async () => {
    const { studio } = await studioOfCaller("catalog");
    const { error } = await db().delete().eq("id", id).eq("tenant_id", studio.id);
    if (error) throw error;
    revalidatePath("/studio/announcements");
  });
}

/** The next running announcement of the business at this address the visitor hasn't closed (`seen`: closed in this browser), or null. */
export async function nextStudioAnnouncement(slug: string, seen: string[]): Promise<Announcement | null> {
  const at = await studioAtSlug(slug);
  if (!at) return null;
  const tenantId = at.studio.id;
  const client = await portalClient(tenantId);
  const [{ data: rows }, { data: dismissed }] = await Promise.all([
    db().select(ANNOUNCEMENT_COLUMNS).eq("tenant_id", tenantId).eq("active", true).order("approved_at", { ascending: true }),
    client
      ? createAdminClient().from("announcement_dismissals").select("announcement_id").eq("actor_type", "studio_client").eq("actor_id", client.customerId)
      : Promise.resolve({ data: [] as { announcement_id: string }[] }),
  ]);
  const closed = new Set([...seen, ...(dismissed ?? []).map((d) => d.announcement_id)]);
  return ((rows ?? []) as unknown as Announcement[]).find((a) => !closed.has(a.id)) ?? null;
}

/** Remembers that the client signed in at this business has closed it (the browser remembers it for everyone). */
export async function dismissStudioAnnouncement(slug: string, id: string): Promise<void> {
  const at = await studioAtSlug(slug);
  const client = at && (await portalClient(at.studio.id));
  if (!client) return;
  const { data } = await db().select("id").eq("id", id).eq("tenant_id", at.studio.id).maybeSingle();
  if (!data) return;
  await createAdminClient()
    .from("announcement_dismissals")
    .upsert({ announcement_id: id, actor_type: "studio_client", actor_id: client.customerId }, { onConflict: "announcement_id,actor_type,actor_id", ignoreDuplicates: true });
}
