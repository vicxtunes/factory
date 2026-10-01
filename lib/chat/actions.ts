"use server";

// Chat server actions — the module's public API for the browser.
//
// Each action is a thin shell around one service function, run through
// server/run.ts (who's calling, safe error messages). The read-only calls the
// chat screen makes most often also have GET Route Handlers (app/api/chat,
// fetched via client/api.ts): the browser runs Server Actions one at a time,
// so reads there load in parallel and never wait behind a send.
//
// Keep business rules out of this file — they belong in server/service.ts
// (flow) and policy.ts (permissions).

import { run } from "./server/run";
import * as service from "./server/service";
import type {
  ChatMessage,
  ChatPerson,
  ChatResult,
  ChatSearchResult,
  ParticipantRef,
  UploadedAttachment,
} from "./types";

// --- Reading ---------------------------------------------------------------

export async function searchContacts(query: string): Promise<ChatResult<ChatPerson[]>> {
  return run((v) => service.searchContacts(v, query));
}

export async function searchMessages(query: string): Promise<ChatResult<ChatSearchResult[]>> {
  return run((v) => service.searchMessages(v, query));
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

/** The order's chat with its client (client, designer, staff): only that order's messages. */
export async function openClientOrderConversation(orderId: string): Promise<ChatResult<string>> {
  return run((v) => service.openClientOrderThread(v, orderId));
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
