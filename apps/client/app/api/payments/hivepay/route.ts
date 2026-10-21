import { applyStudioPayment } from "@repo/lib/studio-payments/server";
import { handleHivepayWebhook } from "@repo/lib/wallet/webhooks";

// HivePay's webhook (mobile money prompts approved or failed, payouts sent or
// failed). A payment's prompt carries this URL; payouts use the one set in
// HivePay's dashboard.
export async function POST(request: Request) {
  const { status, collectionId } = await handleHivepayWebhook(await request.text(), request.headers.get("x-hivepay-signature"));
  // A studio customer's payment goes on its invoice (a no-op for anything else).
  if (collectionId) await applyStudioPayment(collectionId);
  return Response.json({ received: status === 200 }, { status });
}

// HivePay's dashboard checks the URL answers before saving it (and a browser
// opening it does the same): a plain "here". Nothing is read or changed.
export function GET() {
  return Response.json({ ok: true });
}
