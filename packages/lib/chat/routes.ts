// Chat URLs — one definition shared by the UI, push deep links and any page
// that links into chat. Pure; safe on server and client.

/** The chat page. Wrapped in whichever surface's shell the viewer belongs to. */
export const CHAT_PATH = "/chat";

/** Query-string key holding the open conversation. */
export const CONVERSATION_PARAM = "c";

export function chatHref(conversationId?: string | null): string {
  return conversationId ? `${CHAT_PATH}?${CONVERSATION_PARAM}=${encodeURIComponent(conversationId)}` : CHAT_PATH;
}
