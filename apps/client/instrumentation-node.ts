// On the production server, asks HivePay every few minutes about mobile money
// prompts still waiting, so a payment the client approved is recorded even
// when HivePay's webhook never arrives and the payment screen was closed
// (packages/lib/wallet: reconcileWaiting). Every hour, the money watch compares
// the last week with HivePay and alerts the boss to anything that doesn't add
// up, and from 8 pm the boss gets the day's money report
// (packages/lib/wallet/server/watch.ts).

import { applyStudioPayment } from "@repo/lib/studio-payments/server";
import { reconcileWaitingHivepay, sendDailyMoneyReport, watchMoney } from "@repo/lib/wallet/webhooks";

const EVERY_MS = 2 * 60_000;
const WATCH_EVERY_MS = 60 * 60_000;
const REPORT_CHECK_EVERY_MS = 10 * 60_000;

/** Runs `job` every `ms`, never two at once, logging what it throws. */
function every(ms: number, name: string, job: () => Promise<unknown>) {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await job();
    } catch (error) {
      console.error(`${name} failed:`, error);
    } finally {
      running = false;
    }
  }, ms).unref();
}

if (process.env.NODE_ENV === "production") {
  every(EVERY_MS, "hivepay: checking waiting payments", async () => {
    // A studio customer's payment goes on its invoice, as the webhook does.
    for (const id of await reconcileWaitingHivepay()) await applyStudioPayment(id);
  });
  every(WATCH_EVERY_MS, "money watch", watchMoney);
  every(REPORT_CHECK_EVERY_MS, "daily money report", sendDailyMoneyReport);
}
