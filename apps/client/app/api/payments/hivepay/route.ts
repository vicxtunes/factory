import { handleHivepayWebhook } from "@repo/lib/wallet/webhooks";

// HivePay's webhook (mobile money prompts approved or failed). The URL is sent
// with each prompt, so nothing needs setting in HivePay's dashboard.
export async function POST(request: Request) {
  const status = await handleHivepayWebhook(await request.text(), request.headers.get("x-hivepay-signature"));
  return Response.json({ received: status === 200 }, { status });
}
