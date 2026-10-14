import "server-only";

// The wallet module's entry point for a business's money: its customers
// paying for bookings and order requests by mobile money (onto its Business
// card; see server/mobile-money.ts), and the Business card itself
// (server/business.ts).

import { getBalance } from "./server/repository";

export { businessTermsAccepted, getBusinessCard } from "./server/business";
export {
  checkStudioRequestPayment,
  claimStudioPaymentApply,
  paidForStudioRequests,
  releaseStudioPaymentApply,
  startStudioRequestPayment,
  studioPayment,
} from "./server/mobile-money";
export { WalletError } from "./server/errors";

/** What's on a business owner's Aming card (their own wallet): what pays for Aming's orders and extra storage. */
export async function amingCardBalance(ownerClientId: string): Promise<number> {
  return (await getBalance(ownerClientId)).balance;
}
