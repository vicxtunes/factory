import "server-only";

import webpush from "web-push";

let configured = false;

// Idempotent: send.ts calls this before every send rather than at module
// load, so a missing env var surfaces as a clear runtime error instead of a
// silent no-op if this module happens to load before .env is read.
export function ensureVapidConfigured(): void {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set.");
  }
  webpush.setVapidDetails("mailto:dementaacademy@gmail.com", publicKey, privateKey);
  configured = true;
}
