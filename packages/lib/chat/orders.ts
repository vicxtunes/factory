import "server-only";

// Public, server-only API for order code: Aming's cards in an order's chat
// with its client (received, ready for pickup). Callers decide when; these
// functions trust their input.

export { postOrderCard } from "./server/service";
