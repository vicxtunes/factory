import { confirmMarketingUpload, createMarketingUploadSession } from "@/lib/storage/marketing-media-actions";
import { MARKETING_MEDIA_BUCKET } from "@/lib/storage/client";
import { putToSignedUrl } from "@/lib/storage/xhr-upload";

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

// Some OSes/browsers don't have .svg registered in their local MIME
// database, so a picked .svg file's `.type` can come back "" instead of
// "image/svg+xml" — and putToSignedUrl's multipart part takes its
// Content-Type straight from File.type, so an empty type would get stored
// (and later served from the public bucket) as generic
// application/octet-stream, which some browsers refuse to render inside
// <img>. Re-wrap with the right type before it ever reaches the wire so
// Storage always records it correctly.
function withCorrectedType(file: File): File {
  if (file.type || !/\.svg$/i.test(file.name)) return file;
  return new File([file], file.name, { type: "image/svg+xml" });
}

// Direct-to-Supabase-Storage upload for a marketing slide image — same
// signed-upload + progress flow as lib/storage/product-media-client.ts,
// returning a public URL for the form to use instead of a pasted one.
export async function uploadMarketingImage(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  const corrected = withCorrectedType(file);
  const session = await createMarketingUploadSession(corrected.name);
  if (!session.ok) return session;

  const uploaded = await putToSignedUrl(
    MARKETING_MEDIA_BUCKET,
    session.path,
    session.token,
    corrected,
    onProgress ?? (() => {}),
  );
  if (!uploaded.ok) return uploaded;

  return confirmMarketingUpload(session.path);
}
