import "server-only";

// Studio customers paying for their bookings and order requests by mobile money — the
// wallet module's entry point for packages/lib/product-requests (the money
// goes to the studio owner's wallet; see server/mobile-money.ts).

export {
  checkStudioRequestPayment,
  claimStudioPaymentApply,
  paidForStudioRequests,
  releaseStudioPaymentApply,
  startStudioRequestPayment,
  studioPayment,
} from "./server/mobile-money";
export { WalletError } from "./server/errors";
