import { createClient } from "@repo/lib/supabase/browser";
import { confirmItemUpload, confirmMediaReplace, createUploadSession } from "@repo/lib/storage/actions";
import { MEDIA_BUCKET } from "@repo/lib/storage/client";
import { IMMUTABLE_CACHE_SECONDS } from "@repo/lib/storage/xhr-upload";

export type UploadResult = { ok: true } | { ok: false; error: string };

// Runs the full direct-to-Supabase-Storage upload for one file against an
// existing order_item: get a signed upload token (server), PUT the file
// straight to Supabase's Storage API (never through our server/Vercel,
// avoiding its request body size limit — the actual fix for Cloudinary's
// ~20MB cap), then ask the server to verify and record it.
export async function uploadFileToStorage(orderItemId: string, file: File): Promise<UploadResult> {
  const session = await createUploadSession(orderItemId, file.name);
  if (!session.ok) return session;

  const { error } = await createClient()
    .storage.from(MEDIA_BUCKET)
    .uploadToSignedUrl(session.path, session.token, file, { cacheControl: String(IMMUTABLE_CACHE_SECONDS) });
  if (error) {
    return { ok: false, error: error.message || `Upload of "${file.name}" failed.` };
  }

  return confirmItemUpload(orderItemId, session.path);
}

// Same signed-upload flow, but swaps the file at an existing media entry
// in place instead of adding a new one.
export async function replaceFileInStorage(
  mediaId: string,
  orderItemId: string,
  file: File,
): Promise<UploadResult> {
  const session = await createUploadSession(orderItemId, file.name);
  if (!session.ok) return session;

  const { error } = await createClient()
    .storage.from(MEDIA_BUCKET)
    .uploadToSignedUrl(session.path, session.token, file, { cacheControl: String(IMMUTABLE_CACHE_SECONDS) });
  if (error) {
    return { ok: false, error: error.message || `Upload of "${file.name}" failed.` };
  }

  return confirmMediaReplace(mediaId, session.path);
}
