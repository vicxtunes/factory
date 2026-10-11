import { applyStudioPayment } from "@repo/lib/studio-payments/server";
import { handleHivepayWebhook } from "@repo/lib/wallet/webhooks";

// HivePay's webhook (mobile money prompts approved or failed). The URL is sent
// with each prompt, so nothing needs setting in HivePay's dashboard.
export async function POST(request: Request) {
  const { status, collectionId } = await handleHivepayWebhook(await request.text(), request.headers.get("x-hivepay-signature"));
  // A studio customer's payment goes on its invoice (a no-op for anything else).
  if (collectionId) await applyStudioPayment(collectionId);
  return Response.json({ received: status === 200 }, { status });
}
