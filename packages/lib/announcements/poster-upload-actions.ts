"use server";

import { randomUUID } from "crypto";

import { getDashboardSession } from "@repo/lib/auth/session";
import { MARKETING_MEDIA_BUCKET, safeStorageSegment } from "@repo/lib/storage/client";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { studioOfCaller } from "@repo/lib/studios/server";

import { canCreateAnnouncements } from "./access";

type Session = { ok: true; path: string; token: string } | { ok: false; error: string };
type Confirmed = { ok: true; url: string } | { ok: false; error: string };

const POSTER_MAX_BYTES = 10 * 1024 * 1024;

/** Where this caller's posters go: Aming's for staff who write announcements, a business's own for its catalog managers. */
async function posterFolder(): Promise<string | null> {
  const staff = await getDashboardSession();
  if (staff) return canCreateAnnouncements(staff) ? "announcements/aming" : null;
  try {
    const { studio } = await studioOfCaller("catalog");
    return `announcements/${studio.id}`;
  } catch {
    return null;
  }
}

// The poster goes straight from the browser to the public marketing bucket;
// the form then saves its link with the announcement.
export async function createPosterUpload(fileName: string): Promise<Session> {
  const folder = await posterFolder();
  if (!folder) return { ok: false, error: "You can't add announcements." };
  const path = `${folder}/${randomUUID()}-${safeStorageSegment(fileName)}`;
  const { data, error } = await createAdminClient().storage.from(MARKETING_MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Could not start the upload." };
  return { ok: true, path: data.path, token: data.token };
}

/** Checks the poster arrived (and is an image of a sane size) before handing back its public link. */
export async function confirmPosterUpload(path: string): Promise<Confirmed> {
  const folder = await posterFolder();
  if (!folder || !path.startsWith(`${folder}/`) || path.slice(folder.length + 1).includes("/")) return { ok: false, error: "That upload isn't valid." };
  const admin = createAdminClient();
  const name = path.slice(folder.length + 1);
  const { data } = await admin.storage.from(MARKETING_MEDIA_BUCKET).list(folder, { search: name, limit: 10 });
  const file = data?.find((f) => f.name === name);
  if (!file) return { ok: false, error: "The poster didn't arrive. Try again." };
  const size = Number(file.metadata?.size ?? 0);
  if (size > POSTER_MAX_BYTES || !String(file.metadata?.mimetype ?? "").startsWith("image/")) {
    await admin.storage.from(MARKETING_MEDIA_BUCKET).remove([path]);
    return { ok: false, error: "Use a picture under 10 MB (JPG, PNG or WebP)." };
  }
  return { ok: true, url: admin.storage.from(MARKETING_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl };
}
