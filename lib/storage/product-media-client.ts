import {
  confirmProductMediaUpload,
  createProductMediaUploadSession,
  type ProductMediaKind,
} from "@/lib/storage/product-media-actions";
import { PRODUCT_MEDIA_BUCKET } from "@/lib/storage/client";

export type UploadResult = { ok: true } | { ok: false; error: string };

// Raw XHR PUT to the signed-upload endpoint, matching exactly what
// @supabase/storage-js's uploadToSignedUrl sends (same URL shape, same
// `''`-keyed FormData field for the file, same cacheControl field) — the
// one thing the SDK's own fetch-based call can't give us is upload
// progress, which XHR's `upload.onprogress` provides natively. If Supabase
// ever changes this wire format, the failure is loud and safe: the next
// step (confirmProductMediaUpload) re-verifies the object actually landed
// in Storage before recording anything, so a shape mismatch here just
// surfaces as a normal "upload failed" error, never silent corruption.
function putToSignedUrl(path: string, token: string, file: File, onProgress: (fraction: number) => void) {
  return new Promise<UploadResult>((resolve) => {
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);

    const xhr = new XMLHttpRequest();
    const url = new URL(
      `/storage/v1/object/upload/sign/${PRODUCT_MEDIA_BUCKET}/${path}`,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
    url.searchParams.set("token", token);
    xhr.open("PUT", url.toString());
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader("Authorization", `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: `Upload of "${file.name}" failed (${xhr.status}).` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: `Upload of "${file.name}" failed — check your connection.` });
    xhr.send(form);
  });
}

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

  const uploaded = await putToSignedUrl(session.path, session.token, file, onProgress ?? (() => {}));
  if (!uploaded.ok) return uploaded;

  return confirmProductMediaUpload(productId, kind, session.path);
}
