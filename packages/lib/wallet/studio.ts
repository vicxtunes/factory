import "server-only";

// The wallet module's entry point for a business's money: its customers
// paying for bookings and order requests by mobile money (onto its Business
// card; see server/mobile-money.ts), and the Business card itself
// (server/business.ts).

import type { WalletCard } from "./types";
import { getBalance, walletCard } from "./server/repository";

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
export { storedPin, unlockedUntil } from "./server/pin";

/** What's on a business owner's Aming card (their own wallet): what pays for Aming's orders and extra storage. */
export async function amingCardBalance(ownerClientId: string): Promise<number> {
  return (await getBalance(ownerClientId)).balance;
}

/** The owner's Aming card with its number, for the Wallet page. */
export async function amingCard(ownerClientId: string): Promise<{ balance: number; card: WalletCard }> {
  const [{ balance }, card] = await Promise.all([getBalance(ownerClientId), walletCard(ownerClientId)]);
  return { balance, card };
}
