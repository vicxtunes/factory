// On the production server, asks HivePay every few minutes about mobile money
// prompts still waiting, so a payment the client approved is recorded even
// when HivePay's webhook never arrives and the payment screen was closed
// (packages/lib/wallet: reconcileWaiting). Every hour, the money watch compares
// the last week with HivePay and alerts the boss to anything that doesn't add
// up, and as soon as the day ends the boss gets its money report
// (packages/lib/wallet/server/watch.ts). Each morning recurring expenses are
// created and the boss and supervisors hear what's due; autopay bills are
// sent by themselves at their time, after one warning. On the boss's pay day,
// agents' commission goes to their agreed numbers by itself. Just after midnight,
// any money day nobody closed closes by itself (packages/lib/books).

import { tellAgents } from "@repo/lib/agents/server";
import { reviewClientOrders } from "@repo/lib/assistant/server/review";
import { answerWaitingChats } from "@repo/lib/assistant/server/run";
import { applyStudioPayment } from "@repo/lib/studio-payments/server";
import { closePastDays, reconcileAgentPayouts, reconcileWaitingHivepay, reconcileExpensePayouts, reconcileOwnerPayouts, reconcileBusinessPayouts, reconcileVendorPayouts, runAutopay, runWeeklyAgentPay, sendDailyMoneyReport, sendExpenseReminder, sendLateMoneyNote, watchMoney } from "@repo/lib/wallet/webhooks";

const EVERY_MS = 2 * 60_000;
const ASSISTANT_EVERY_MS = 2_000;
const ASSISTANT_REVIEW_EVERY_MS = 60_000;
const WATCH_EVERY_MS = 60 * 60_000;
const REPORT_CHECK_EVERY_MS = 10 * 60_000;
// The day's money report goes out within a minute of midnight.
const DAILY_REPORT_EVERY_MS = 60_000;

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

// Not in the test copy (scripts/deploy.sh test): it has no HivePay keys, and
// its data is a copy that must not be "reconciled" or reported on.
if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_TEST_COPY !== "1") {
  every(EVERY_MS, "hivepay: checking waiting payments", async () => {
    // A studio customer's payment goes on its invoice, as the webhook does.
    for (const id of await reconcileWaitingHivepay()) await applyStudioPayment(id);
  });
  every(EVERY_MS, "hivepay: checking bill payouts", reconcileExpensePayouts);
  every(EVERY_MS, "autopay: bills sending by themselves", runAutopay);
  every(EVERY_MS, "hivepay: checking agent payouts", () => reconcileAgentPayouts(null));
  // Business cards' and vendors' payouts too, not only when someone opens them (audit, 2026-11-14).
  every(EVERY_MS, "hivepay: checking business and vendor payouts", async () => {
    await reconcileBusinessPayouts(null);
    await reconcileVendorPayouts(null);
  });
  every(EVERY_MS, "hivepay: checking the boss's withdrawals", reconcileOwnerPayouts);
  every(EVERY_MS, "agents: weekly commission", () => runWeeklyAgentPay());
  every(EVERY_MS, "telling agents", tellAgents);
  every(WATCH_EVERY_MS, "money watch", watchMoney);
  every(DAILY_REPORT_EVERY_MS, "daily money report", sendDailyMoneyReport);
  every(DAILY_REPORT_EVERY_MS, "closing past days", closePastDays);
  every(REPORT_CHECK_EVERY_MS, "late money note", sendLateMoneyNote);
  every(REPORT_CHECK_EVERY_MS, "expense reminder", sendExpenseReminder);
}

// The assistant answers clients' chats wherever it has a key, except the test copy.
if ((process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) && process.env.NEXT_PUBLIC_TEST_COPY !== "1") {
  every(ASSISTANT_EVERY_MS, "assistant", answerWaitingChats);
  every(ASSISTANT_REVIEW_EVERY_MS, "assistant order review", reviewClientOrders);
}
