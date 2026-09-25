"use server";

// Chat server actions — the module's public API for the browser.
//
// Each action is a thin shell: resolve who's calling (identity.ts), call one
// service function, and convert the outcome into a ChatResult. Expected
// failures (ChatError) are returned as `{ ok: false, error }` with a
// user-safe message; anything unexpected is logged server-side and replaced
// with a generic message, so internals never reach the browser.
//
// Keep business rules out of this file — they belong in server/service.ts
// (flow) and policy.ts (permissions).

import { ChatError, requireChatViewer, type ChatViewer } from "./server/identity";
import * as service from "./server/service";
import type {
  ChatMessage,
  ChatPerson,
  ChatRealtimeConfig,
  ChatResult,
  ConversationDetail,
  ConversationSummary,
  MessagePage,
  ParticipantRef,
  UploadedAttachment,
} from "./types";

async function run<T>(fn: (viewer: ChatViewer) => Promise<T>): Promise<ChatResult<T>>;
async function run(fn: (viewer: ChatViewer) => Promise<void>): Promise<ChatResult>;
async function run<T>(fn: (viewer: ChatViewer) => Promise<T>): Promise<{ ok: true; data?: T } | { ok: false; error: string }> {
  try {
    const viewer = await requireChatViewer();
    const data = await fn(viewer);
    return data === undefined ? { ok: true } : { ok: true, data };
  } catch (err) {
    if (err instanceof ChatError) return { ok: false, error: err.message };
    console.error("chat action failed:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

// --- Reading ---------------------------------------------------------------

export async function getInbox(): Promise<ChatResult<ConversationSummary[]>> {
  return run((v) => service.getInbox(v));
}

export async function getUnreadTotal(): Promise<ChatResult<number>> {
  return run((v) => service.getUnreadTotal(v));
}

export async function getConversation(conversationId: string): Promise<ChatResult<ConversationDetail>> {
  return run((v) => service.getConversationDetail(v, conversationId));
}

export async function getMessages(conversationId: string, before?: string | null): Promise<ChatResult<MessagePage>> {
  return run((v) => service.getMessages(v, conversationId, before));
}

export async function searchContacts(query: string): Promise<ChatResult<ChatPerson[]>> {
  return run((v) => service.searchContacts(v, query));
}

export async function getRealtimeConfig(): Promise<ChatResult<ChatRealtimeConfig>> {
  return run(async (v) => service.getRealtimeConfig(v));
}

// --- Opening conversations -------------------------------------------------

export async function openDirectConversation(target: ParticipantRef): Promise<ChatResult<string>> {
  return run((v) => service.openDirect(v, target));
}

export async function openSupportConversation(clientId?: string): Promise<ChatResult<string>> {
  return run((v) => service.openSupport(v, clientId));
}

export async function openOrderConversation(orderId: string): Promise<ChatResult<string>> {
  return run((v) => service.openOrderThread(v, orderId));
}

export async function createGroupConversation(input: {
  title: string;
  members: ParticipantRef[];
}): Promise<ChatResult<string>> {
  return run((v) => service.createGroup(v, input));
}

// --- Messages --------------------------------------------------------------

export async function sendMessage(input: {
  conversationId: string;
  body: string;
  replyToId?: string | null;
  attachments?: UploadedAttachment[];
}): Promise<ChatResult<ChatMessage>> {
  return run((v) => service.sendMessage(v, input));
}

export async function editMessage(messageId: string, body: string): Promise<ChatResult> {
  return run((v) => service.editMessage(v, messageId, body));
}

export async function deleteMessage(messageId: string): Promise<ChatResult> {
  return run((v) => service.deleteMessage(v, messageId));
}

export async function markConversationRead(conversationId: string): Promise<ChatResult> {
  return run((v) => service.markRead(v, conversationId));
}

export async function createAttachmentUpload(input: {
  conversationId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ChatResult<{ path: string; token: string; bucket: string }>> {
  return run((v) => service.createAttachmentUpload(v, input));
}

// --- Membership & settings -------------------------------------------------

export async function addConversationMembers(conversationId: string, people: ParticipantRef[]): Promise<ChatResult> {
  return run((v) => service.addMembers(v, conversationId, people));
}

export async function removeConversationMember(conversationId: string, target: ParticipantRef): Promise<ChatResult> {
  return run((v) => service.removeMember(v, conversationId, target));
}

export async function leaveConversation(conversationId: string): Promise<ChatResult> {
  return run((v) => service.leaveConversation(v, conversationId));
}

export async function renameConversation(conversationId: string, title: string): Promise<ChatResult> {
  return run((v) => service.renameConversation(v, conversationId, title));
}

export async function setConversationMuted(conversationId: string, muted: boolean): Promise<ChatResult> {
  return run((v) => service.setMuted(v, conversationId, muted));
}
