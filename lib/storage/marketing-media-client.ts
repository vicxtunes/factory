import { confirmMarketingUpload, createMarketingUploadSession } from "@/lib/storage/marketing-media-actions";
import { MARKETING_MEDIA_BUCKET } from "@/lib/storage/client";
import { putToSignedUrl } from "@/lib/storage/xhr-upload";

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

// Direct-to-Supabase-Storage upload for a marketing slide image — same
// signed-upload + progress flow as lib/storage/product-media-client.ts,
// returning a public URL for the form to use instead of a pasted one.
export async function uploadMarketingImage(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  const session = await createMarketingUploadSession(file.name);
  if (!session.ok) return session;

  const uploaded = await putToSignedUrl(
    MARKETING_MEDIA_BUCKET,
    session.path,
    session.token,
    file,
    onProgress ?? (() => {}),
  );
  if (!uploaded.ok) return uploaded;

  return confirmMarketingUpload(session.path);
}
