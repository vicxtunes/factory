// Sends a file to Storage with a signed upload pass (createSignedUploadUrl):
// small files in one PUT (putToSignedUrl), big ones in 6 MB pieces over the
// TUS protocol, so no single request comes near the server's body limit and a
// dropped connection carries on from the last piece instead of starting over.
//
// 2026-11-11: a 356 MB photo-book zip was refused over and over (Nginx takes
// 250 MB a request); pieces fix that for good.
import { IMMUTABLE_CACHE_SECONDS, putToSignedUrl } from "./xhr-upload";

/** Files bigger than this go in pieces. */
const PIECES_FROM_BYTES = 20 * 1024 * 1024;
/** Supabase Storage's TUS piece size. */
const PIECE_BYTES = 6 * 1024 * 1024;

/** Storage said no (too big, not allowed…): trying again won't help. */
export class UploadRefused extends Error {}

/** Where a piece-by-piece upload is, kept so a retry continues it. */
export type ResumeState = { url: string };

export type SendOptions = {
  onProgress: (fraction: number) => void;
  /** A piece-by-piece upload already started for this pass. */
  resume?: ResumeState | null;
  /** Called once a piece-by-piece upload has its address, to keep it. */
  onResume?: (state: ResumeState) => void;
  /** Send in one PUT whatever the size (the server refused pieces). */
  wholeOnly?: boolean;
};

const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function refusal(status: number, name: string, body: string): Error {
  if (status === 413 || /too large|exceeded the maximum/i.test(body)) return new UploadRefused(`"${name}" is too big to upload.`);
  // 408 timeout and 429 too many: the connection, not the file.
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return new UploadRefused(`"${name}" was refused (${status}).`);
  return new Error(`Upload of "${name}" failed (${status}).`);
}

/** Throws UploadRefused when retrying is pointless, Error when the connection failed. */
export async function sendToStorage(bucket: string, path: string, token: string, file: File, options: SendOptions): Promise<void> {
  if (file.size <= PIECES_FROM_BYTES || options.wholeOnly) {
    const res = await putToSignedUrl(bucket, path, token, file, options.onProgress);
    if (!res.ok) throw res.status ? refusal(res.status, file.name, res.error) : new Error(res.error);
    return;
  }

  const headers = { apikey: anon(), "x-signature": token, "Tus-Resumable": "1.0.0" };
  let url = options.resume?.url ?? null;
  let offset = 0;
  if (url) {
    const head = await fetch(url, { method: "HEAD", headers, cache: "no-store" }).catch(() => null);
    if (!head) throw new Error(`Upload of "${file.name}" failed — check your connection.`);
    if (head.ok) offset = Number(head.headers.get("Upload-Offset") ?? 0);
    else url = null; // Gone or expired: start this pass again.
  }
  if (!url) {
    const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
    const meta = [
      ["bucketName", bucket],
      ["objectName", path],
      ["contentType", file.type || "application/octet-stream"],
      ["cacheControl", String(IMMUTABLE_CACHE_SECONDS)],
    ]
      .map(([k, v]) => `${k} ${b64(v)}`)
      .join(",");
    const created = await fetch(`${base()}/storage/v1/upload/resumable/sign`, {
      method: "POST",
      headers: { ...headers, "Upload-Length": String(file.size), "Upload-Metadata": meta, "x-upsert": "false" },
    }).catch(() => null);
    if (!created) throw new Error(`Upload of "${file.name}" failed — check your connection.`);
    // A server without piece uploads (or with them broken): one PUT, as before.
    if (created.status >= 500 && created.status !== 503) return sendToStorage(bucket, path, token, file, { ...options, wholeOnly: true });
    if (!created.ok) throw refusal(created.status, file.name, await created.text().catch(() => ""));
    const location = created.headers.get("Location");
    if (!location) throw new Error(`Upload of "${file.name}" failed (no upload address).`);
    // Only the path: the server may name itself http:// behind the proxy.
    url = `${base()}${new URL(location, base()).pathname}`;
    options.onResume?.({ url });
  }

  while (offset < file.size) {
    const piece = file.slice(offset, Math.min(offset + PIECE_BYTES, file.size));
    const start = offset;
    offset = await patchPiece(url, headers, start, piece, file.name, (sent) => options.onProgress((start + sent) / file.size));
  }
  options.onProgress(1);
}

function patchPiece(url: string, headers: Record<string, string>, offset: number, piece: Blob, name: string, onSent: (bytes: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PATCH", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.setRequestHeader("Upload-Offset", String(offset));
    xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onSent(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(Number(xhr.getResponseHeader("Upload-Offset") ?? offset + piece.size));
      // 409: the server has a different offset (a piece landed but its reply was lost): ask again.
      else if (xhr.status === 409) reject(new Error(`Upload of "${name}" was interrupted.`));
      else reject(refusal(xhr.status, name, xhr.responseText));
    };
    xhr.onerror = () => reject(new Error(`Upload of "${name}" failed — check your connection.`));
    xhr.send(piece);
  });
}
