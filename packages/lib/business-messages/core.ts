// Business messages (owner, 2026-11-27): a Pro business and its clients write
// to each other like WhatsApp. Per client: one general chat, and one on each of
// their projects. Pure shapes, safe in the browser; the rules are in ./server.ts.
// Messages are shown with Aming chat's own bubbles (packages/ui/chat), so they
// travel as its ChatMessage.

import type { ChatMessage } from "@repo/lib/chat/types";

export type Side = "business" | "customer";

/** One chat in a list. Seen from either side: `title` is the client (business side) or the business (client side). */
export interface BizChatSummary {
  id: string;
  customerId: string;
  title: string;
  /** The project it's about; null: the general chat. */
  projectId: string | null;
  projectTitle: string | null;
  avatarUrl: string | null;
  lastMessageAt: string | null;
  lastPreview: string | null;
  /** The last message was the viewer's own (its ticks show). */
  lastMine: boolean;
  unread: number;
}

/** An open chat: who it's with, its messages (oldest first), and where it listens. */
export interface BizThread {
  chat: BizChatSummary;
  /** The viewer's side, to tell their own messages apart. */
  side: Side;
  /** The viewer's Aming account on the business side (only their own messages can be edited); null for the client. */
  meClientId: string | null;
  messages: ChatMessage[];
  /** Pass as `before` for older messages; null at the start. */
  nextCursor: string | null;
  /** The other side has read up to here (✓✓). */
  otherReadAt: string | null;
  /** Typing channel, given only after the access check. */
  typingChannel: string;
}

/** A message's side and author, carried in ChatMessage.sender. */
export const senderRef = (side: Side, clientId: string | null) => ({ type: "client" as const, id: `${side}:${clientId ?? ""}` });

/** Whether a message is the viewer's own: same side, and on the business side, the same person. */
export function isMine(message: ChatMessage, side: Side, meClientId: string | null): boolean {
  const id = message.sender?.id ?? "";
  if (!id.startsWith(`${side}:`)) return false;
  return side === "customer" || id === `business:${meClientId ?? ""}`;
}

/** The other side's ✓✓: read once their read mark reaches the message. */
export const seenBy = (otherReadAt: string | null, createdAt: string) => !!otherReadAt && otherReadAt >= createdAt;

export const TYPING_EVENT = "typing";
export const SIGNAL_EVENT = "bchat";
