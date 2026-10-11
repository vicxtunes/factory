import "server-only";

// A studio's customer paid for a booking or an order by mobile money (the
// money is in the studio owner's wallet: packages/lib/wallet). This puts the
// payment where the studio and the client look for it: the request is
// confirmed, its invoice made (from the quotation it got when it was asked
// for) and the payment recorded on that invoice.
//
// Called by whoever sees the payment succeed: HivePay's webhook and the page
// following the prompt. Only one of them gets the turn (applied_at), and a
// turn that fails is given back for the next try.

import { localDate } from "@repo/lib/accounting/core/period";
import { invoices } from "@repo/lib/billing/server";
import { bookingRequests } from "@repo/lib/booking-requests/server";
import { productRequests } from "@repo/lib/product-requests/server";
import { studioScope } from "@repo/lib/studios/core";
import { studios } from "@repo/lib/studios/server";
import { claimStudioPaymentApply, releaseStudioPaymentApply, studioPayment } from "@repo/lib/wallet/studio";

/** Who confirmed it, in the project's history. */
const ACTOR = "Paid online";

export async function applyStudioPayment(collectionId: string): Promise<void> {
  const payment = await studioPayment(collectionId);
  if (!payment?.succeeded || payment.applied) return;
  if (!(await claimStudioPaymentApply(collectionId))) return;
  try {
    const studio = await studios.owned(payment.ownerClientId);
    if (!studio) throw new Error("the studio no longer exists");
    const scope = studioScope(studio);
    // An invoice paid from its link is there already; a booking or order is confirmed, which makes its invoice.
    const { invoiceId } = payment.invoiceId
      ? { invoiceId: payment.invoiceId }
      : payment.bookingId
        ? await bookingRequests.confirm(scope, payment.bookingId, ACTOR)
        : await productRequests.confirm(scope, payment.requestId!);
    // Priced on request: no invoice yet, the money waits in the studio's wallet.
    if (!invoiceId) return;
    const invoice = await invoices.get(scope, invoiceId);
    const amount = Math.min(payment.amount, invoice?.balance ?? 0);
    if (amount > 0) {
      await invoices.recordPayment(scope, invoiceId, {
        amount,
        method: "mobile_money",
        receivedOn: localDate(new Date(), scope.timeZone),
        reference: payment.reference,
        note: "Paid in the app by mobile money.",
      });
    }
  } catch (error) {
    console.error("studio-payments: could not apply", collectionId, error);
    await releaseStudioPaymentApply(collectionId);
  }
}
