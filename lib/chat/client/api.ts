"use client";

// Chat reads from the browser, over the GET Route Handlers in app/api/chat
// (see lib/chat/actions.ts for why they aren't Server Actions). Same names
// and ChatResult shape as the actions they replace.

import type {
  ChatRealtimeConfig,
  ChatResult,
  ConversationDetail,
  ConversationSummary,
  MessagePage,
} from "../types";

async function get<T>(path: string): Promise<ChatResult<T>> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    return (await res.json()) as ChatResult<T>;
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection." } as ChatResult<T>;
  }
}

const conversationPath = (id: string) => `/api/chat/conversations/${encodeURIComponent(id)}`;

export function getInbox() {
  return get<ConversationSummary[]>("/api/chat/inbox");
}

export function getUnreadTotal() {
  return get<number>("/api/chat/unread");
}

export function getConversation(conversationId: string) {
  return get<ConversationDetail>(conversationPath(conversationId));
}

export function getMessages(conversationId: string, before?: string | null) {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return get<MessagePage>(`${conversationPath(conversationId)}/messages${query}`);
}

export function getRealtimeConfig() {
  return get<ChatRealtimeConfig>("/api/chat/realtime");
}
