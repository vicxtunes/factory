"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveActor, type AuditActor } from "@/lib/audit/log";
import { AVATAR_BUCKET } from "@/lib/storage/client";
import type { AuditActorType } from "@/lib/types";

// Self-service "manage profile" (display name + picture) shared by every
// signed-in surface — dashboard staff, clients, workers, designers — each
// of which already has its own name/avatar_url columns on its own table
// (profiles/clients/workers/designers). resolveActor() (the same session
// resolution audit logging uses) says which row is "mine".

type Result = { ok: true } | { ok: false; error: string };

const NAME_MAX = 100;

// resolveActor() can also return "system" (automated events, e.g. a DB
// trigger) — never a real signed-in session, so never something with a
// profile row of its own to edit here.
type ProfileActorType = Exclude<AuditActorType, "system">;

const TABLE: Record<ProfileActorType, { table: string; nameColumn: string }> = {
  dashboard_user: { table: "profiles", nameColumn: "full_name" },
  worker: { table: "workers", nameColumn: "name" },
  designer: { table: "designers", nameColumn: "name" },
  client: { table: "clients", nameColumn: "name" },
};

async function requireProfileActor(): Promise<
  { ok: true; actor: AuditActor & { type: ProfileActorType } } | { ok: false; error: string }
> {
  const actor = await resolveActor();
  if (!actor || actor.type === "system") return { ok: false, error: "Not signed in." };
  return { ok: true, actor: actor as AuditActor & { type: ProfileActorType } };
}

// Every surface reads its own session fresh per request (see
// lib/auth/session.ts) and the modal calls router.refresh() after a save,
// so this just needs to invalidate the cached pages, not push data back.
function revalidateProfileViews(): void {
  revalidatePath("/dashboard");
  revalidatePath("/client-side");
  revalidatePath("/factory");
  revalidatePath("/graphics");
}

export async function updateMyName(name: string): Promise<Result> {
  const resolved = await requireProfileActor();
  if (!resolved.ok) return resolved;
  const { actor } = resolved;

  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return { ok: false, error: "Name is required." };
  if (trimmed.length > NAME_MAX) return { ok: false, error: `Name must be ${NAME_MAX} characters or fewer.` };

  const { table, nameColumn } = TABLE[actor.type];
  const admin = createAdminClient();
  const { error } = await admin
    .from(table)
    .update({ [nameColumn]: trimmed })
    .eq("id", actor.id);
  if (error) return { ok: false, error: error.message };

  revalidateProfileViews();
  return { ok: true };
}

function extensionFor(fileName: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  return (match?.[1] ?? "jpg").toLowerCase();
}

// Deterministic, per-actor path (unlike order media's randomUUID-prefixed
// ones) so re-uploading overwrites the same object in place — see the
// migration's comment on why that means no orphaned-file cleanup is needed.
export async function createAvatarUploadSession(
  fileName: string,
): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  const resolved = await requireProfileActor();
  if (!resolved.ok) return resolved;
  const { actor } = resolved;
  if (!fileName.trim()) return { ok: false, error: "Missing file details." };

  const path = `avatars/${actor.type}-${actor.id}.${extensionFor(fileName)}`;
  const { data, error } = await createAdminClient()
    .storage.from(AVATAR_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return { ok: false, error: error?.message ?? "Could not start upload." };
  return { ok: true, path: data.path, token: data.token };
}

// Re-verifies the object actually landed in Storage, then records its
// (cache-busted) public URL against the signed-in actor's own row — same
// verify-then-record posture as lib/storage/actions.ts's confirmItemUpload.
export async function confirmAvatarUpload(
  path: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const resolved = await requireProfileActor();
  if (!resolved.ok) return resolved;
  const { actor } = resolved;
  if (!path) return { ok: false, error: "Missing upload details." };

  const admin = createAdminClient();
  const lastSlash = path.lastIndexOf("/");
  const dir = path.slice(0, lastSlash);
  const basename = path.slice(lastSlash + 1);
  const { data: found, error: listError } = await admin.storage
    .from(AVATAR_BUCKET)
    .list(dir, { search: basename, limit: 10 });
  if (listError || !found?.some((f) => f.name === basename)) {
    return { ok: false, error: "Could not verify the uploaded file in storage." };
  }

  const { data: pub } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // The storage path is reused (upsert) on every re-upload, so the public
  // URL alone never changes — a cache-busting query so a browser that
  // already fetched the old image actually re-fetches the new one.
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { table } = TABLE[actor.type];
  const { error } = await admin.from(table).update({ avatar_url: url }).eq("id", actor.id);
  if (error) return { ok: false, error: error.message };

  revalidateProfileViews();
  return { ok: true, url };
}

// "Remove photo" — back to the initials fallback. The underlying Storage
// object is left in place (harmless, and re-uploading later reuses the
// same path anyway) rather than adding a delete round trip here.
export async function removeMyAvatar(): Promise<Result> {
  const resolved = await requireProfileActor();
  if (!resolved.ok) return resolved;
  const { actor } = resolved;

  const { table } = TABLE[actor.type];
  const admin = createAdminClient();
  const { error } = await admin.from(table).update({ avatar_url: null }).eq("id", actor.id);
  if (error) return { ok: false, error: error.message };

  revalidateProfileViews();
  return { ok: true };
}
