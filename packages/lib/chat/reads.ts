import "server-only";

// Read-only chat calls for server code outside packages/lib/chat: the GET Route
// Handlers under apps/factory/app/api/chat (which the browser reaches through
// client/api.ts) and app/chat/layout.tsx (which loads the inbox with the
// page). Same ChatResult shape and access checks as actions.ts.

import { run } from "./server/run";
import * as service from "./server/service";

export function getInbox() {
  return run((v) => service.getInbox(v));
}

export function getUnreadTotal() {
  return run((v) => service.getUnreadTotal(v));
}

export function getConversation(conversationId: string) {
  return run((v) => service.getConversationDetail(v, conversationId));
}

export function getMessages(conversationId: string, before?: string | null) {
  return run((v) => service.getMessages(v, conversationId, before));
}

export function getRealtimeConfig() {
  return run(async (v) => service.getRealtimeConfig(v));
}
