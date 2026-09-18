import {
  confirmProductMediaUpload,
  createProductMediaUploadSession,
  type ProductMediaKind,
} from "@/lib/storage/product-media-actions";
import { PRODUCT_MEDIA_BUCKET } from "@/lib/storage/client";
import { putToSignedUrl } from "@/lib/storage/xhr-upload";

export type UploadResult = { ok: true } | { ok: false; error: string };

// Direct-to-Supabase-Storage upload for one product media file: get a
// signed upload token (server), PUT the file straight to Supabase's
// Storage API (never through our server/Vercel, avoiding its request body
// size limit), then ask the server to verify and record it. Same flow as
// lib/storage/upload-client.ts's uploadFileToStorage, targeting the
// product-media bucket/table instead of order-media — plus real upload
// progress, which that flow doesn't have.
export async function uploadProductMedia(
  productId: string,
  kind: ProductMediaKind,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  const session = await createProductMediaUploadSession(productId, kind, file.name);
  if (!session.ok) return session;

  const uploaded = await putToSignedUrl(PRODUCT_MEDIA_BUCKET, session.path, session.token, file, onProgress ?? (() => {}));
  if (!uploaded.ok) return uploaded;

  return confirmProductMediaUpload(productId, kind, session.path);
}
