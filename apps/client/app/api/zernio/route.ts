import { createHmac, timingSafeEqual } from "node:crypto";

import { applyZernio } from "@repo/lib/social/server";

// Zernio's webhook (packages/lib/social): a post went out, partly, or failed.
// Signed: X-Zernio-Signature is the hex HMAC-SHA256 of the raw body with
// ZERNIO_WEBHOOK_SECRET. Deliveries can repeat; saving the same result twice is harmless.
export async function POST(request: Request) {
  const body = await request.text();
  const secret = process.env.ZERNIO_WEBHOOK_SECRET;
  const given = Buffer.from(request.headers.get("x-zernio-signature") ?? "");
  const expected = secret ? Buffer.from(createHmac("sha256", secret).update(body).digest("hex")) : null;
  if (!expected || expected.length !== given.length || !timingSafeEqual(expected, given)) return Response.json({ received: false }, { status: 401 });

  const event = JSON.parse(body) as {
    event: string;
    post?: { id: string; status: string; platforms?: { platform: string; accountId?: string; status: string; publishedUrl?: string; error?: string }[] };
  };
  if (event.post && event.event.startsWith("post.")) {
    await applyZernio(event.post.id, event.post.status, (event.post.platforms ?? []).map((p) => ({ accountId: p.accountId ?? "", platform: p.platform, status: p.status, url: p.publishedUrl ?? null, error: p.error ?? null })));
  }
  return Response.json({ received: true });
}
