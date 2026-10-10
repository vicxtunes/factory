import "server-only";

// Provider webhooks — the wallet module's entry point for route handlers
// (actions.ts is for the browser).

export { handleWebhook as handleHivepayWebhook } from "./server/mobile-money";
