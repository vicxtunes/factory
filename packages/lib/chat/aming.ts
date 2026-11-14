import "server-only";

// Public, server-only API for Aming's notices in a client's Aming chat
// (packages/lib/wallet's notices post here).

export { postAmingNotice } from "./server/service";
