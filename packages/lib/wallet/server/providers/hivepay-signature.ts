import { createHmac, timingSafeEqual } from "node:crypto";

// HivePay's webhook signature, kept apart from ./hivepay.ts (server-only,
// reads the settings) so it can be tested.

/** Webhooks older than this are refused (replay protection, per HivePay's docs). */
const TOLERANCE_SECONDS = 300;

/**
 * Checks an `X-HivePay-Signature: t=<unix>,v=<hex>` header: HMAC-SHA256 of
 * `${t}.${rawBody}` with the webhook secret, and `t` within 5 minutes.
 */
export function verifyHivepaySignature(rawBody: string, header: string | null, secret: string, now = Date.now()): boolean {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return i < 0 ? [p.trim(), ""] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!parts.t || !Number.isFinite(t) || !parts.v || Math.abs(now / 1000 - t) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex"));
  const given = Buffer.from(parts.v);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
