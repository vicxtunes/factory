import "server-only";

// This app's ObjectStore: a Cloudflare R2 bucket through its S3-compatible
// API, signed with aws4fetch (small; no AWS SDK). Settings come from the
// environment (see packages/lib/photos/README.md → "Settings"):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
//   R2_ENDPOINT (optional: any S3-compatible endpoint, e.g. a local MinIO for tests)

import { AwsClient } from "aws4fetch";

import { PhotoError, type ObjectStore } from "../../ports";

function settings() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const endpoint = process.env.R2_ENDPOINT ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new PhotoError("Photo storage isn't set up yet. Ask Aming to finish the storage settings.");
  }
  return { base: `${endpoint.replace(/\/$/, "")}/${bucket}`, bucket, client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }) };
}

/** A key as a URL path: each segment encoded, slashes kept. */
const path = (key: string) => key.split("/").map(encodeURIComponent).join("/");

async function presign(method: "GET" | "PUT", key: string, expires: number, headers: Record<string, string> = {}): Promise<string> {
  const { base, client } = settings();
  const url = new URL(`${base}/${path(key)}`);
  url.searchParams.set("X-Amz-Expires", String(expires));
  // allHeaders: sign the headers given too (an upload's content type), not just the host.
  const signed = await client.sign(new Request(url, { method, headers }), { aws: { signQuery: true, allHeaders: true } });
  return signed.url;
}

async function call(method: string, key: string, headers: Record<string, string> = {}): Promise<Response> {
  const { base, client } = settings();
  return client.fetch(`${base}/${path(key)}`, { method, headers });
}

export const r2ObjectStore: ObjectStore = {
  // The content type is signed, so the upload must use it.
  putUrl: (key, contentType, expires) => presign("PUT", key, expires, { "content-type": contentType }),

  getUrl: (key, expires) => presign("GET", key, expires),

  async size(key) {
    const res = await call("HEAD", key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`photos: could not check ${key}: HTTP ${res.status}`);
    return Number(res.headers.get("content-length") ?? 0);
  },

  async move(fromKey, toKey) {
    const { bucket } = settings();
    const copied = await call("PUT", toKey, { "x-amz-copy-source": `/${bucket}/${path(fromKey)}` });
    if (!copied.ok) throw new Error(`photos: could not move ${fromKey}: HTTP ${copied.status} ${await copied.text()}`);
    await call("DELETE", fromKey);
  },

  async remove(keys) {
    // A few at a time; a missing file is fine (DELETE is idempotent).
    for (let i = 0; i < keys.length; i += 10) {
      const results = await Promise.all(keys.slice(i, i + 10).map((k) => call("DELETE", k)));
      const failed = results.find((r) => !r.ok && r.status !== 404);
      if (failed) throw new Error(`photos: could not delete files: HTTP ${failed.status}`);
    }
  },
};
