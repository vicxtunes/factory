import "server-only";

// Chat service — the use cases. Each exported function:
//   1. loads what it needs through the repository/directory,
//   2. asks lib/chat/policy.ts whether the viewer may do it,
//   3. performs the write,
//   4. schedules side effects (realtime doorbells, push) with after(), so
//      the sender's request returns as soon as the data is saved.
//
// Every function takes the viewer explicitly — the service never reads
// cookies or sessions itself (that's identity.ts, called by actions.ts), so
// it can be reused from a route handler, a cron job or a test unchanged.

import { after } from "next/server";

import * as policy from "../policy";
import { CHAT_LIMITS } from "../policy";
import type {
  ChatMessage,
  ChatPerson,
  ChatRealtimeConfig,
  ChatSearchResult,
  ChatSignal,
  ConversationDetail,
  ConversationSummary,
  MessagePage,
  ParticipantRef,
  UploadedAttachment,
} from "../types";
import * as directory from "./directory";
import { ChatError, type ChatViewer } from "./identity";
import { notifyRecipients } from "./notifier";
import {
  buildContext,
  describeMessage,
  hydrateMessages,
  presentConversation,
  sameParticipant,
  snippetAround,
  toMembers,
  toRef,
  toSummary,
} from "./presenter";
import * as repo from "./repository";
import { channelsFor, conversationChannel, ringPeople } from "./signals";
import * as storage from "./storage";

// Deliberately vague: "not found" and "not allowed" look identical, so the
// API can't be used to probe which conversations exist.
const NOT_FOUND = "Conversation not found.";

// ---------------------------------------------------------------------------
// Access helpers
// ---------------------------------------------------------------------------

interface Access {
  conversation: repo.ConversationRow;
  /** The viewer's *active* membership, or null (e.g. staff viewing a team thread). */
  membership: repo.ParticipantRow | null;
}

async function loadAccess(viewer: ParticipantRef, conversationId: string): Promise<Access> {
  const conversation = await repo.getConversation(conversationId);
  if (!conversation) throw new ChatError(NOT_FOUND);
  const row = await repo.getParticipant(conversationId, viewer);
  const membership = row && !row.left_at ? row : null;
  if (!policy.canAccessConversation(viewer, conversation, !!membership)) throw new ChatError(NOT_FOUND);
  return { conversation, membership };
}

/**
 * Staff who post in (or read) a team thread they haven't joined start
 * "following" it — they get its notifications and their read state is kept.
 */
async function ensureMember(viewer: ParticipantRef, access: Access): Promise<void> {
  if (access.membership) return;
  await repo.addParticipants(access.conversation.id, [viewer]);
  access.membership = await repo.getParticipant(access.conversation.id, viewer);
}

/** Rings every active member (and the staff team for team threads), after the response. */
function ringConversation(conversation: repo.ConversationRow, type: ChatSignal["type"], extra: ParticipantRef[] = []): void {
  after(async () => {
    const members = await repo.listActiveParticipants([conversation.id]);
    await ringPeople(
      [...members.map(toRef), ...extra],
      { type, conversationId: conversation.id },
      policy.isTeamConversation(conversation.kind),
    );
  });
}

async function postSystemMessage(conversation: repo.ConversationRow, body: string): Promise<void> {
  await repo.insertMessage({ conversation_id: conversation.id, kind: "system", body });
}

function validateTitle(title: string): string {
  const t = title.trim();
  if (!t) throw new ChatError("Give the group a name.");
  if (t.length > CHAT_LIMITS.maxGroupTitleLength) {
    throw new ChatError(`Group names can be at most ${CHAT_LIMITS.maxGroupTitleLength} characters.`);
  }
  return t;
}

function dedupeRefs(refs: ParticipantRef[], exclude?: ParticipantRef): ParticipantRef[] {
  const seen = new Map<string, ParticipantRef>();
  for (const r of refs) if (!exclude || !sameParticipant(r, exclude)) seen.set(policy.participantKey(r), r);
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function getInbox(viewer: ParticipantRef): Promise<ConversationSummary[]> {
  const rows = await repo.listInbox(viewer, policy.isStaff(viewer));
  const ctx = await buildContext(rows);
  return rows.map((r) => toSummary(viewer, r, ctx));
}

/** Total unread across all un-muted conversations — for nav badges. */
export async function getUnreadTotal(viewer: ParticipantRef): Promise<number> {
  const rows = await repo.listInbox(viewer, policy.isStaff(viewer));
  return rows.reduce((sum, r) => sum + (r.muted ? 0 : r.unread_count), 0);
}

export async function getConversationDetail(viewer: ParticipantRef, conversationId: string): Promise<ConversationDetail> {
  const { conversation: c, membership } = await loadAccess(viewer, conversationId);
  const ctx = await buildContext([c]);
  const { title, avatarUrl } = presentConversation(viewer, c, ctx);
  const role = membership?.role ?? null;

  return {
    id: c.id,
    kind: c.kind,
    title,
    avatarUrl,
    orderId: c.order_id,
    clientId: c.client_id,
    lastMessageAt: c.last_message_at,
    lastMessagePreview: c.last_message_preview,
    lastMessageSenderName: c.last_message_sender_name,
    unreadCount: 0,
    muted: membership?.muted ?? false,
    isParticipant: !!membership,
    members: toMembers(c.id, ctx),
    me: { type: viewer.type, id: viewer.id },
    permissions: {
      canPost: true, // access implies posting rights for every kind today
      canManageMembers: policy.canManageMembers(viewer, c, role),
      canRemoveMembers: policy.canRemoveMember(viewer, c, role),
      canRename: policy.canRename(c, role),
      canLeave: policy.canLeave(viewer, c, !!membership),
    },
    typingChannel: conversationChannel(c.id),
  };
}

export async function getMessages(
  viewer: ParticipantRef,
  conversationId: string,
  before?: string | null,
): Promise<MessagePage> {
  await loadAccess(viewer, conversationId);
  const { rows, hasMore } = await repo.listMessages(conversationId, CHAT_LIMITS.messagesPerPage, before);
  const chronological = rows.reverse();
  return {
    messages: await hydrateMessages(chronological),
    nextCursor: hasMore && chronological.length ? chronological[0].created_at : null,
  };
}

export async function searchContacts(viewer: ParticipantRef, query: string): Promise<ChatPerson[]> {
  return directory.searchContacts(viewer, query);
}

/**
 * Full-text-ish search over every message the viewer can see (substring,
 * case-insensitive, trigram-indexed). Newest first.
 */
export async function searchMessages(viewer: ParticipantRef, query: string): Promise<ChatSearchResult[]> {
  const q = query.trim();
  if (q.length < CHAT_LIMITS.minSearchLength) return [];

  // Escape ILIKE wildcards so "50%" searches for a literal percent sign.
  const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const rows = await repo.searchMessages(viewer, policy.isStaff(viewer), pattern, CHAT_LIMITS.maxSearchResults);
  if (!rows.length) return [];

  const conversations = await repo.getConversations([...new Set(rows.map((r) => r.conversation_id))]);
  const ctx = await buildContext(conversations);
  const byId = new Map(conversations.map((c) => [c.id, c]));

  return rows.flatMap((r) => {
    const c = byId.get(r.conversation_id);
    if (!c) return [];
    return [
      {
        messageId: r.message_id,
        conversationId: c.id,
        conversationTitle: presentConversation(viewer, c, ctx).title,
        conversationKind: c.kind,
        senderName: r.sender_name,
        snippet: snippetAround(r.body, q),
        createdAt: r.created_at,
      },
    ];
  });
}

export function getRealtimeConfig(viewer: ParticipantRef): ChatRealtimeConfig {
  return { channels: channelsFor(viewer) };
}

// ---------------------------------------------------------------------------
// Opening conversations (all idempotent: returns the existing one if any)
// ---------------------------------------------------------------------------

/** "Message this person" — a DM, or the client's support thread for staff ↔ client. */
export async function openDirect(viewer: ChatViewer, target: ParticipantRef): Promise<string> {
  const route = policy.routeDirectConversation(viewer, target);
  if (route === "forbidden") throw new ChatError("You can't message this person.");
  if (route === "support") return openSupport(viewer, viewer.type === "client" ? viewer.id : target.id);

  if (policy.requiresRelationship(viewer.type, target.type) && !(await directory.haveRelationship(viewer, target))) {
    throw new ChatError("You can only message people you're working with on an order.");
  }
  if (!(await directory.isActivePerson(target))) throw new ChatError("This person is no longer available.");

  const key = policy.directKey(viewer, target);
  const existing = await repo.findDirectConversation(key);
  const conversation =
    existing ??
    (
      await repo.createConversation(
        { kind: "direct", direct_key: key, created_by_type: viewer.type, created_by_id: viewer.id },
        () => repo.findDirectConversation(key),
      )
    ).conversation;

  // Idempotent — also heals the tiny window where a concurrent creator
  // inserted the conversation but hadn't added members yet.
  await repo.addParticipants(conversation.id, [viewer, target]);
  return conversation.id;
}

/**
 * The client ↔ team thread. Clients always get their own; staff pass the
 * client's id (and start following the thread by opening it).
 */
export async function openSupport(viewer: ChatViewer, clientId?: string): Promise<string> {
  if (viewer.type === "client") clientId = viewer.id;
  else if (!policy.isStaff(viewer)) throw new ChatError("Support chat is between clients and staff.");
  if (!clientId) throw new ChatError("Choose a client.");
  if (!(await directory.isActivePerson({ type: "client", id: clientId }))) throw new ChatError("Client not found.");

  const existing = await repo.findSupportConversation(clientId);
  const conversation =
    existing ??
    (
      await repo.createConversation(
        { kind: "support", client_id: clientId, created_by_type: viewer.type, created_by_id: viewer.id },
        () => repo.findSupportConversation(clientId!),
      )
    ).conversation;

  await repo.addParticipants(conversation.id, dedupeRefs([{ type: "client", id: clientId }, viewer]));
  return conversation.id;
}

/** The order's shared thread. Anyone involved in the order may open it. */
export async function openOrderThread(viewer: ChatViewer, orderId: string): Promise<string> {
  const order = await directory.getOrderContext(orderId);
  if (!order || !(await directory.isInvolvedInOrder(viewer, order))) throw new ChatError("Order not found.");

  const existing = await repo.findOrderConversation(orderId);
  if (existing) {
    await repo.addParticipants(existing.id, [viewer]);
    return existing.id;
  }

  const { conversation, created } = await repo.createConversation(
    { kind: "order", order_id: orderId, created_by_type: viewer.type, created_by_id: viewer.id },
    () => repo.findOrderConversation(orderId),
  );

  const initial: ParticipantRef[] = [viewer];
  if (created) {
    // Seed with the people the order is about; staff have implicit access.
    if (order.clientId) initial.push({ type: "client", id: order.clientId });
    if (order.designerId) initial.push({ type: "designer", id: order.designerId });
  }
  await repo.addParticipants(conversation.id, dedupeRefs(initial));
  return conversation.id;
}

export async function createGroup(viewer: ChatViewer, input: { title: string; members: ParticipantRef[] }): Promise<string> {
  if (!policy.canCreateGroup(viewer)) throw new ChatError("You can't create group chats.");
  const title = validateTitle(input.title);
  const members = dedupeRefs(input.members, viewer);
  if (!members.length) throw new ChatError("Add at least one person.");
  if (members.length + 1 > CHAT_LIMITS.maxGroupMembers) {
    throw new ChatError(`Groups can have at most ${CHAT_LIMITS.maxGroupMembers} members.`);
  }
  for (const m of members) {
    if (!policy.canJoinGroup(m) || !(await directory.isActivePerson(m))) {
      throw new ChatError("One of the selected people can't be added to a group.");
    }
  }

  const { conversation } = await repo.createConversation({
    kind: "group",
    title,
    created_by_type: viewer.type,
    created_by_id: viewer.id,
  });
  await repo.addParticipants(conversation.id, [viewer], "owner");
  await repo.addParticipants(conversation.id, members, "member");
  await postSystemMessage(conversation, `${viewer.name} created the group "${title}"`);
  ringConversation(conversation, "conversation");
  return conversation.id;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface SendMessageInput {
  conversationId: string;
  body: string;
  replyToId?: string | null;
  attachments?: UploadedAttachment[];
}

export async function sendMessage(viewer: ChatViewer, input: SendMessageInput): Promise<ChatMessage> {
  const body = input.body.trim();
  const uploads = input.attachments ?? [];
  if (!body && !uploads.length) throw new ChatError("Message can't be empty.");
  if (body.length > CHAT_LIMITS.maxMessageLength) {
    throw new ChatError(`Messages can be at most ${CHAT_LIMITS.maxMessageLength} characters.`);
  }
  if (uploads.length > CHAT_LIMITS.maxAttachmentsPerMessage) {
    throw new ChatError(`You can attach at most ${CHAT_LIMITS.maxAttachmentsPerMessage} files at once.`);
  }

  const access = await loadAccess(viewer, input.conversationId);
  const { conversation } = access;
  await ensureMember(viewer, access);

  if (input.replyToId) {
    const quoted = await repo.getMessage(input.replyToId);
    if (!quoted || quoted.conversation_id !== conversation.id) throw new ChatError("The message you replied to is gone.");
  }

  // Never trust the browser's word that an upload happened, or where.
  const prefix = storage.conversationPrefix(conversation.id);
  const verified = await Promise.all(
    uploads.map(async (u) => {
      if (!u.path.startsWith(prefix)) throw new ChatError("Invalid attachment.");
      const found = await storage.verifyUploadedObject(u.path);
      if (!found) throw new ChatError(`"${u.fileName}" didn't finish uploading. Please try again.`);
      const mimeType = found.mimeType || u.mimeType;
      if (!policy.isAllowedAttachmentType(mimeType)) throw new ChatError(`"${u.fileName}" isn't a supported file type.`);
      return { ...u, mimeType, sizeBytes: found.sizeBytes ?? u.sizeBytes };
    }),
  );

  const message = await repo.insertMessage({
    conversation_id: conversation.id,
    sender_type: viewer.type,
    sender_id: viewer.id,
    sender_name: viewer.name,
    kind: verified.length ? "attachment" : "text",
    body,
    reply_to_id: input.replyToId ?? null,
  });

  await repo.insertAttachments(
    verified.map((u) => ({
      message_id: message.id,
      conversation_id: conversation.id,
      kind: storage.attachmentKindFor(u.mimeType),
      storage_path: u.path,
      file_name: u.fileName,
      mime_type: u.mimeType,
      size_bytes: u.sizeBytes,
      width: u.width ?? null,
      height: u.height ?? null,
      duration_ms: u.durationMs ?? null,
    })),
  );

  // Sending implies you've read everything up to your own message.
  await repo.setLastRead(conversation.id, viewer, message.created_at);

  after(() =>
    fanOutNewMessage(viewer, conversation, describeMessage(body, verified.map((u) => ({ kind: storage.attachmentKindFor(u.mimeType) })))),
  );

  const [hydrated] = await hydrateMessages([message]);
  return hydrated;
}

/** Realtime + push for a new message. Runs after the response; never throws. */
async function fanOutNewMessage(sender: ChatViewer, conversation: repo.ConversationRow, preview: string): Promise<void> {
  try {
    const members = await repo.listActiveParticipants([conversation.id]);
    const isTeam = policy.isTeamConversation(conversation.kind);

    await ringPeople(members.map(toRef), { type: "message", conversationId: conversation.id }, isTeam);

    const recipients = members
      .filter((m) => !m.muted && !sameParticipant(toRef(m), sender))
      .map(toRef);
    // A client writing into a thread no staff member follows yet must still
    // reach someone: notify the whole team.
    if (isTeam && !policy.isStaff(sender) && !members.some((m) => m.participant_type === "dashboard_user")) {
      recipients.push(...(await directory.listStaffRefs()));
    }
    if (!recipients.length) return;

    const ctx = await buildContext([conversation]);
    const showSender = conversation.kind !== "direct";
    await Promise.all(
      dedupeRefs(recipients).map((r) =>
        notifyRecipients([r], {
          title: presentConversation(r, conversation, ctx).title,
          body: showSender ? `${sender.name}: ${preview}` : preview,
          conversationId: conversation.id,
        }),
      ),
    );
  } catch (err) {
    console.error("chat fan-out failed:", err);
  }
}

async function loadOwnMessage(viewer: ParticipantRef, messageId: string): Promise<{ message: repo.MessageRow; access: Access }> {
  const message = await repo.getMessage(messageId);
  if (!message) throw new ChatError("Message not found.");
  const access = await loadAccess(viewer, message.conversation_id);
  if (!policy.canModifyMessage(viewer, message)) throw new ChatError("You can only change your own messages.");
  if (message.deleted_at) throw new ChatError("This message was deleted.");
  return { message, access };
}

export async function editMessage(viewer: ParticipantRef, messageId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) throw new ChatError("Message can't be empty.");
  if (text.length > CHAT_LIMITS.maxMessageLength) {
    throw new ChatError(`Messages can be at most ${CHAT_LIMITS.maxMessageLength} characters.`);
  }
  const { message, access } = await loadOwnMessage(viewer, messageId);
  await repo.updateMessageBody(message.id, text);
  ringConversation(access.conversation, "message");
}

export async function deleteMessage(viewer: ParticipantRef, messageId: string): Promise<void> {
  const { message, access } = await loadOwnMessage(viewer, messageId);
  const paths = await repo.deleteAttachmentsForMessage(message.id);
  await repo.softDeleteMessage(message.id);
  after(() => storage.removeObjects(paths));
  ringConversation(access.conversation, "message");
}

/**
 * Marks everything up to the newest message as read; rings members so
 * "Seen" updates live. Uses the conversation's own last_message_at (a
 * database timestamp) rather than the app server's clock, so clock skew
 * between app and database can never leave a read message counted unread —
 * and a message arriving mid-request correctly stays unread.
 */
export async function markRead(viewer: ParticipantRef, conversationId: string): Promise<void> {
  const access = await loadAccess(viewer, conversationId);
  const { conversation, membership } = access;
  if (!conversation.last_message_at) return;
  if (membership?.last_read_at && membership.last_read_at >= conversation.last_message_at) return;

  await ensureMember(viewer, access);
  await repo.setLastRead(conversation.id, viewer, conversation.last_message_at);
  ringConversation(conversation, "read");
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export async function createAttachmentUpload(
  viewer: ParticipantRef,
  input: { conversationId: string; fileName: string; mimeType: string; sizeBytes: number },
): Promise<{ path: string; token: string; bucket: string }> {
  await loadAccess(viewer, input.conversationId);
  if (!input.fileName.trim()) throw new ChatError("Missing file name.");
  if (!policy.isAllowedAttachmentType(input.mimeType)) throw new ChatError(`"${input.fileName}" isn't a supported file type.`);
  if (input.sizeBytes > CHAT_LIMITS.maxAttachmentBytes) {
    throw new ChatError(`"${input.fileName}" is larger than ${CHAT_LIMITS.maxAttachmentBytes / 1024 / 1024}MB.`);
  }
  const upload = await storage.createSignedUpload(input.conversationId, input.fileName);
  return { ...upload, bucket: storage.CHAT_BUCKET };
}

// ---------------------------------------------------------------------------
// Membership & settings
// ---------------------------------------------------------------------------

export async function addMembers(viewer: ChatViewer, conversationId: string, people: ParticipantRef[]): Promise<void> {
  const access = await loadAccess(viewer, conversationId);
  const { conversation, membership } = access;
  if (!policy.canManageMembers(viewer, conversation, membership?.role ?? null)) {
    throw new ChatError("You can't add people to this conversation.");
  }

  const current = await repo.listActiveParticipants([conversation.id]);
  const toAdd = dedupeRefs(people, viewer).filter((p) => !current.some((m) => sameParticipant(toRef(m), p)));
  if (!toAdd.length) return;
  if (conversation.kind === "group" && current.length + toAdd.length > CHAT_LIMITS.maxGroupMembers) {
    throw new ChatError(`Groups can have at most ${CHAT_LIMITS.maxGroupMembers} members.`);
  }
  for (const p of toAdd) {
    if (!policy.canBeAddedTo(conversation.kind, p) || !(await directory.isActivePerson(p))) {
      throw new ChatError("One of the selected people can't be added here.");
    }
  }

  await ensureMember(viewer, access);
  await repo.addParticipants(conversation.id, toAdd);
  const resolved = await directory.resolvePeople(toAdd);
  const names = toAdd.map((p) => resolved.get(policy.participantKey(p))!.name).join(", ");
  await postSystemMessage(conversation, `${viewer.name} added ${names}`);
  ringConversation(conversation, "conversation");
}

export async function removeMember(viewer: ChatViewer, conversationId: string, target: ParticipantRef): Promise<void> {
  if (sameParticipant(viewer, target)) return leaveConversation(viewer, conversationId);
  const { conversation, membership } = await loadAccess(viewer, conversationId);
  if (!policy.canRemoveMember(viewer, conversation, membership?.role ?? null)) {
    throw new ChatError("You can't remove people from this conversation.");
  }
  const targetRow = await repo.getParticipant(conversation.id, target);
  if (!targetRow || targetRow.left_at) return;

  await repo.markLeft(conversation.id, target);
  const person = await directory.resolvePerson(target);
  await postSystemMessage(conversation, `${viewer.name} removed ${person.name}`);
  ringConversation(conversation, "conversation", [target]); // the removed person's inbox updates too
}

export async function leaveConversation(viewer: ChatViewer, conversationId: string): Promise<void> {
  const { conversation, membership } = await loadAccess(viewer, conversationId);
  if (!membership || !policy.canLeave(viewer, conversation, true)) throw new ChatError("You can't leave this conversation.");

  await repo.markLeft(conversation.id, viewer);

  // A group must always have an owner: hand it to the longest-standing member.
  if (conversation.kind === "group" && membership.role === "owner") {
    const remaining = await repo.listActiveParticipants([conversation.id]);
    if (remaining.length && !remaining.some((m) => m.role === "owner")) {
      await repo.setRole(conversation.id, toRef(remaining[0]), "owner");
    }
  }

  // Staff unfollowing a support thread is silent; leaving a group/order thread is announced.
  if (conversation.kind !== "support") await postSystemMessage(conversation, `${viewer.name} left`);
  ringConversation(conversation, "conversation", [viewer]);
}

export async function renameConversation(viewer: ChatViewer, conversationId: string, title: string): Promise<void> {
  const { conversation, membership } = await loadAccess(viewer, conversationId);
  if (!policy.canRename(conversation, membership?.role ?? null)) throw new ChatError("You can't rename this conversation.");
  const clean = validateTitle(title);
  if (clean === conversation.title) return;
  await repo.updateConversationTitle(conversation.id, clean);
  await postSystemMessage(conversation, `${viewer.name} renamed the group to "${clean}"`);
  ringConversation(conversation, "conversation");
}

export async function setMuted(viewer: ParticipantRef, conversationId: string, muted: boolean): Promise<void> {
  const access = await loadAccess(viewer, conversationId);
  await ensureMember(viewer, access);
  await repo.setMuted(conversationId, viewer, muted);
}
