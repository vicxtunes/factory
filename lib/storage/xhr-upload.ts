export type XhrUploadResult = { ok: true } | { ok: false; error: string };

// Raw XHR PUT to Supabase Storage's signed-upload endpoint, matching
// exactly what @supabase/storage-js's uploadToSignedUrl sends (same URL
// shape, same `''`-keyed FormData field for the file, same cacheControl
// field) — the one thing the SDK's own fetch-based call can't give us is
// upload progress, which XHR's `upload.onprogress` provides natively. If
// Supabase ever changes this wire format, the failure is loud and safe:
// every caller re-verifies the object actually landed in Storage (a
// `list()` check) before recording anything, so a shape mismatch here just
// surfaces as a normal "upload failed" error, never silent corruption.
//
// Shared by lib/storage/product-media-client.ts and
// lib/storage/marketing-media-client.ts so the wire-format knowledge lives
// in exactly one place.
export function putToSignedUrl(
  bucket: string,
  path: string,
  token: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<XhrUploadResult> {
  return new Promise((resolve) => {
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);

    const xhr = new XMLHttpRequest();
    const url = new URL(`/storage/v1/object/upload/sign/${bucket}/${path}`, process.env.NEXT_PUBLIC_SUPABASE_URL);
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
