import "server-only";

// Attachment storage adapter — the ONLY place chat touches Supabase Storage.
//
// Upload flow (same direct-to-storage pattern as lib/storage/actions.ts, so
// large files never pass through our server):
//   1. createUpload() — server checks access, returns a signed upload token
//      for a path scoped to the conversation.
//   2. Browser PUTs the file straight to Storage.
//   3. sendMessage() — server verifies each object really exists (never
//      trusting the client's word) before recording it.
//
// The bucket is private; files are only ever read through short-lived
// signed URLs minted after the viewer's access has been checked.

import { randomUUID } from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { safeStorageSegment } from "@/lib/storage/client";

import { CHAT_LIMITS } from "../policy";
import type { AttachmentKind } from "../types";

export const CHAT_BUCKET = "chat-attachments";

export function attachmentKindFor(mimeType: string): AttachmentKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

/** Every upload lives under its conversation's folder — used to verify ownership. */
export function conversationPrefix(conversationId: string): string {
  return `conversations/${conversationId}/`;
}

export async function createSignedUpload(
  conversationId: string,
  fileName: string,
): Promise<{ path: string; token: string }> {
  const path = `${conversationPrefix(conversationId)}${randomUUID()}-${safeStorageSegment(fileName)}`;
  const { data, error } = await createAdminClient().storage.from(CHAT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "Could not start upload.");
  return { path: data.path, token: data.token };
}

/** Confirms an uploaded object exists; returns its real size + MIME type. */
export async function verifyUploadedObject(
  path: string,
): Promise<{ sizeBytes: number | null; mimeType: string | null } | null> {
  const slash = path.lastIndexOf("/");
  const dir = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await createAdminClient().storage.from(CHAT_BUCKET).list(dir, { search: name, limit: 5 });
  const found = data?.find((f) => f.name === name);
  if (error || !found) return null;
  return {
    sizeBytes: (found.metadata?.size as number | undefined) ?? null,
    mimeType: (found.metadata?.mimetype as string | undefined) ?? null,
  };
}

/** Signed read URLs for many objects in one round trip, keyed by path. */
export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data } = await createAdminClient()
    .storage.from(CHAT_BUCKET)
    .createSignedUrls(paths, CHAT_LIMITS.attachmentUrlTtl);
  const out = new Map<string, string>();
  for (const row of data ?? []) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  return out;
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await createAdminClient().storage.from(CHAT_BUCKET).remove(paths);
  if (error) console.error("chat attachment cleanup failed:", error.message);
}
