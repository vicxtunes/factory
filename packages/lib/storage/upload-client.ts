import { confirmItemUpload, confirmMediaReplace, createUploadSession } from "@repo/lib/storage/actions";
import { MEDIA_BUCKET } from "@repo/lib/storage/client";
import { putToSignedUrl } from "@repo/lib/storage/xhr-upload";

export type UploadResult = { ok: true } | { ok: false; error: string };

// Runs the full direct-to-Supabase-Storage upload for one file against an
// existing order_item: get a signed upload token (server), PUT the file
// straight to Supabase's Storage API (never through our server/Vercel,
// avoiding its request body size limit — the actual fix for Cloudinary's
// ~20MB cap), then ask the server to verify and record it.
//
// Phones on slow connections stall on big camera photos, so a failed try is
// retried with a fresh upload pass (an old one may have expired).
const TRIES = 3;
const RETRY_WAIT_MS = [3_000, 10_000];

export async function uploadFileToStorage(
  orderItemId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  let last: UploadResult = { ok: false, error: `Upload of "${file.name}" failed.` };
  for (let attempt = 0; attempt < TRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_WAIT_MS[attempt - 1]));
    try {
      last = await uploadOnce(orderItemId, file, onProgress ?? (() => {}));
    } catch (err) {
      last = { ok: false, error: err instanceof Error ? err.message : `Upload of "${file.name}" failed.` };
    }
    if (last.ok) return last;
  }
  return last;
}

async function uploadOnce(orderItemId: string, file: File, onProgress: (fraction: number) => void): Promise<UploadResult> {
  const session = await createUploadSession(orderItemId, file.name);
  if (!session.ok) return session;

  const uploaded = await putToSignedUrl(MEDIA_BUCKET, session.path, session.token, file, onProgress);
  if (!uploaded.ok) return uploaded;

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

  const uploaded = await putToSignedUrl(MEDIA_BUCKET, session.path, session.token, file, () => {});
  if (!uploaded.ok) return uploaded;

  return confirmMediaReplace(mediaId, session.path);
}
