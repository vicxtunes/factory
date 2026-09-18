"use server";

import { randomUUID } from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";

import { MARKETING_MEDIA_BUCKET } from "./client";

type UploadSessionResult = { ok: true; path: string; token: string } | { ok: false; error: string };
type ConfirmResult = { ok: true; url: string } | { ok: false; error: string };

// No slide row exists yet when a staff member is filling out "Add slide",
// so unlike product media this doesn't write anywhere itself — it just
// hands back a working public URL, which the form drops into the same
// "Image URL" field a pasted link would (see marketing-panel.tsx).
// createMarketingSlide/updateMarketingSlide do the actual DB write either
// way, so both paths end up identical from there on.
export async function createMarketingUploadSession(fileName: string): Promise<UploadSessionResult> {
  await requireRole("boss");
  if (!fileName.trim()) return { ok: false, error: "Missing file details." };

  const path = `marketing/${randomUUID()}-${fileName}`;
  const { data, error } = await createAdminClient()
    .storage.from(MARKETING_MEDIA_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Could not start upload." };
  return { ok: true, path: data.path, token: data.token };
}

// Re-verifies the object actually landed in Storage before handing back its
// public URL — same posture as lib/storage/actions.ts's confirmItemUpload.
export async function confirmMarketingUpload(path: string): Promise<ConfirmResult> {
  await requireRole("boss");
  if (!path) return { ok: false, error: "Missing upload details." };

  const lastSlash = path.lastIndexOf("/");
  const dir = path.slice(0, lastSlash);
  const basename = path.slice(lastSlash + 1);

  const admin = createAdminClient();
  const { data: found, error: listError } = await admin.storage
    .from(MARKETING_MEDIA_BUCKET)
    .list(dir, { search: basename, limit: 10 });
  if (listError || !found?.some((f) => f.name === basename)) {
    return { ok: false, error: "Could not verify the uploaded file in storage." };
  }

  const { data: pub } = admin.storage.from(MARKETING_MEDIA_BUCKET).getPublicUrl(path);
  return { ok: true, url: pub.publicUrl };
}
