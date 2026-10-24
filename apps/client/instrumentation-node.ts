// On the production server, asks HivePay every few minutes about mobile money
// prompts still waiting, so a payment the client approved is recorded even
// when HivePay's webhook never arrives and the payment screen was closed
// (packages/lib/wallet: reconcileWaiting).

import { applyStudioPayment } from "@repo/lib/studio-payments/server";
import { reconcileWaitingHivepay } from "@repo/lib/wallet/webhooks";

const EVERY_MS = 2 * 60_000;

if (process.env.NODE_ENV === "production") {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      // A studio customer's payment goes on its invoice, as the webhook does.
      for (const id of await reconcileWaitingHivepay()) await applyStudioPayment(id);
    } catch (error) {
      console.error("hivepay: checking waiting payments failed:", error);
    } finally {
      running = false;
    }
  }, EVERY_MS).unref();
}
