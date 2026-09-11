import { createClient } from "@/lib/supabase/browser";
import { confirmItemUpload, createUploadSession } from "@/lib/storage/actions";
import { MEDIA_BUCKET } from "@/lib/storage/client";

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
    .uploadToSignedUrl(session.path, session.token, file);
  if (error) {
    return { ok: false, error: error.message || `Upload of "${file.name}" failed.` };
  }

  return confirmItemUpload(orderItemId, session.path);
}
