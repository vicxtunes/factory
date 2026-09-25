import "server-only";

// Repository — every read/write of the chat_* tables, and nothing else. No
// authorization happens here (that's the service's job); functions are thin,
// typed wrappers so the service reads as business logic, not query syntax.

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

import type { AttachmentKind, ConversationKind, MessageKind, ParticipantRef, ParticipantType } from "../types";

// ---------------------------------------------------------------------------
// Row shapes (snake_case, exactly as stored)
// ---------------------------------------------------------------------------

export interface ConversationRow {
  id: string;
  kind: ConversationKind;
  title: string | null;
  order_id: string | null;
  client_id: string | null;
  direct_key: string | null;
  created_by_type: string;
  created_by_id: string;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_name: string | null;
}

export interface ParticipantRow {
  conversation_id: string;
  participant_type: ParticipantType;
  participant_id: string;
  role: "owner" | "member";
  joined_at: string;
  last_read_at: string | null;
  muted: boolean;
  left_at: string | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_type: ParticipantType | null;
  sender_id: string | null;
  sender_name: string | null;
  kind: MessageKind;
  body: string;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface AttachmentRow {
  id: string;
  message_id: string;
  conversation_id: string;
  kind: AttachmentKind;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: string;
}

export interface InboxRow {
  id: string;
  kind: ConversationKind;
  title: string | null;
  order_id: string | null;
  client_id: string | null;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_name: string | null;
  is_participant: boolean;
  muted: boolean;
  last_read_at: string | null;
  unread_count: number;
}

const UNIQUE_VIOLATION = "23505";

function db(): SupabaseClient {
  return createAdminClient();
}

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export async function getConversation(id: string): Promise<ConversationRow | null> {
  const { data, error } = await db().from("chat_conversations").select("*").eq("id", id).maybeSingle<ConversationRow>();
  if (error) fail("getConversation", error);
  return data;
}

async function findOne(column: string, value: string, kind: ConversationKind): Promise<ConversationRow | null> {
  const { data, error } = await db()
    .from("chat_conversations")
    .select("*")
    .eq("kind", kind)
    .eq(column, value)
    .maybeSingle<ConversationRow>();
  if (error) fail("findConversation", error);
  return data;
}

export const findDirectConversation = (key: string) => findOne("direct_key", key, "direct");
export const findOrderConversation = (orderId: string) => findOne("order_id", orderId, "order");
export const findSupportConversation = (clientId: string) => findOne("client_id", clientId, "support");

/**
 * Inserts a conversation. For kinds with a uniqueness rule (direct pair,
 * one-per-order, one-per-client) two people opening the same thread at the
 * same moment race; the loser gets the winner's row back via `refetch`.
 */
export async function createConversation(
  row: Pick<ConversationRow, "kind" | "created_by_type" | "created_by_id"> &
    Partial<Pick<ConversationRow, "title" | "order_id" | "client_id" | "direct_key">>,
  refetch?: () => Promise<ConversationRow | null>,
): Promise<{ conversation: ConversationRow; created: boolean }> {
  const { data, error } = await db().from("chat_conversations").insert(row).select("*").single<ConversationRow>();
  if (!error && data) return { conversation: data, created: true };
  if (error?.code === UNIQUE_VIOLATION && refetch) {
    const existing = await refetch();
    if (existing) return { conversation: existing, created: false };
  }
  fail("createConversation", error ?? { message: "no row returned" });
}

export async function getConversations(ids: string[]): Promise<ConversationRow[]> {
  if (!ids.length) return [];
  const { data, error } = await db().from("chat_conversations").select("*").in("id", ids);
  if (error) fail("getConversations", error);
  return (data ?? []) as ConversationRow[];
}

export async function updateConversationTitle(id: string, title: string): Promise<void> {
  const { error } = await db().from("chat_conversations").update({ title }).eq("id", id);
  if (error) fail("updateConversationTitle", error);
}

export async function listInbox(viewer: ParticipantRef, includeTeam: boolean): Promise<InboxRow[]> {
  const { data, error } = await db().rpc("chat_inbox", {
    p_type: viewer.type,
    p_id: viewer.id,
    p_include_team: includeTeam,
  });
  if (error) fail("listInbox", error);
  return (data ?? []) as InboxRow[];
}

export interface SearchRow {
  message_id: string;
  conversation_id: string;
  sender_name: string | null;
  body: string;
  created_at: string;
}

/** Messages matching an (already escaped) ILIKE pattern that the viewer can see. */
export async function searchMessages(
  viewer: ParticipantRef,
  includeTeam: boolean,
  pattern: string,
  limit: number,
): Promise<SearchRow[]> {
  const { data, error } = await db().rpc("chat_search", {
    p_type: viewer.type,
    p_id: viewer.id,
    p_include_team: includeTeam,
    p_pattern: pattern,
    p_limit: limit,
  });
  if (error) fail("searchMessages", error);
  return (data ?? []) as SearchRow[];
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

/** The person's row in a conversation, including if they've left. */
export async function getParticipant(conversationId: string, p: ParticipantRef): Promise<ParticipantRow | null> {
  const { data, error } = await db()
    .from("chat_participants")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("participant_type", p.type)
    .eq("participant_id", p.id)
    .maybeSingle<ParticipantRow>();
  if (error) fail("getParticipant", error);
  return data;
}

/** Active (not-left) members of one or more conversations. */
export async function listActiveParticipants(conversationIds: string[]): Promise<ParticipantRow[]> {
  if (!conversationIds.length) return [];
  const { data, error } = await db()
    .from("chat_participants")
    .select("*")
    .in("conversation_id", conversationIds)
    .is("left_at", null)
    .order("joined_at");
  if (error) fail("listActiveParticipants", error);
  return (data ?? []) as ParticipantRow[];
}

/**
 * Adds people (or re-activates ones who left). Existing active members keep
 * their role and read state.
 */
export async function addParticipants(
  conversationId: string,
  people: ParticipantRef[],
  role: "owner" | "member" = "member",
): Promise<void> {
  if (!people.length) return;
  const client = db();
  const { data: existing, error: readError } = await client
    .from("chat_participants")
    .select("participant_type, participant_id, left_at")
    .eq("conversation_id", conversationId);
  if (readError) fail("addParticipants", readError);

  const known = new Map((existing ?? []).map((r) => [`${r.participant_type}:${r.participant_id}`, r.left_at as string | null]));
  const fresh = people.filter((p) => !known.has(`${p.type}:${p.id}`));
  const returning = people.filter((p) => known.get(`${p.type}:${p.id}`));

  if (fresh.length) {
    const { error } = await client.from("chat_participants").upsert(
      fresh.map((p) => ({ conversation_id: conversationId, participant_type: p.type, participant_id: p.id, role })),
      { onConflict: "conversation_id,participant_type,participant_id", ignoreDuplicates: true },
    );
    if (error) fail("addParticipants", error);
  }
  for (const p of returning) {
    const { error } = await client
      .from("chat_participants")
      .update({ left_at: null, joined_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("participant_type", p.type)
      .eq("participant_id", p.id);
    if (error) fail("addParticipants", error);
  }
}

async function updateParticipant(conversationId: string, p: ParticipantRef, patch: Partial<ParticipantRow>): Promise<void> {
  const { error } = await db()
    .from("chat_participants")
    .update(patch)
    .eq("conversation_id", conversationId)
    .eq("participant_type", p.type)
    .eq("participant_id", p.id);
  if (error) fail("updateParticipant", error);
}

export const setLastRead = (conversationId: string, p: ParticipantRef, at: string) =>
  updateParticipant(conversationId, p, { last_read_at: at });

export const setMuted = (conversationId: string, p: ParticipantRef, muted: boolean) =>
  updateParticipant(conversationId, p, { muted });

export const markLeft = (conversationId: string, p: ParticipantRef) =>
  updateParticipant(conversationId, p, { left_at: new Date().toISOString() });

export const setRole = (conversationId: string, p: ParticipantRef, role: "owner" | "member") =>
  updateParticipant(conversationId, p, { role });

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function insertMessage(
  row: Pick<MessageRow, "conversation_id" | "kind" | "body"> &
    Partial<Pick<MessageRow, "sender_type" | "sender_id" | "sender_name" | "reply_to_id">>,
): Promise<MessageRow> {
  const { data, error } = await db().from("chat_messages").insert(row).select("*").single<MessageRow>();
  if (error || !data) fail("insertMessage", error ?? { message: "no row returned" });
  return data;
}

export async function getMessage(id: string): Promise<MessageRow | null> {
  const { data, error } = await db().from("chat_messages").select("*").eq("id", id).maybeSingle<MessageRow>();
  if (error) fail("getMessage", error);
  return data;
}

export async function getMessagesByIds(ids: string[]): Promise<MessageRow[]> {
  if (!ids.length) return [];
  const { data, error } = await db().from("chat_messages").select("*").in("id", ids);
  if (error) fail("getMessagesByIds", error);
  return (data ?? []) as MessageRow[];
}

/**
 * Newest-first page of messages strictly before `before` (an ISO timestamp),
 * fetching one extra row to know whether an older page exists.
 */
export async function listMessages(
  conversationId: string,
  limit: number,
  before?: string | null,
): Promise<{ rows: MessageRow[]; hasMore: boolean }> {
  let q = db()
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) fail("listMessages", error);
  const rows = (data ?? []) as MessageRow[];
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function updateMessageBody(id: string, body: string): Promise<void> {
  const { error } = await db().from("chat_messages").update({ body, edited_at: new Date().toISOString() }).eq("id", id);
  if (error) fail("updateMessageBody", error);
}

export async function softDeleteMessage(id: string): Promise<void> {
  const { error } = await db().from("chat_messages").update({ body: "", deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) fail("softDeleteMessage", error);
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export async function insertAttachments(rows: Omit<AttachmentRow, "id" | "created_at">[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await db().from("chat_attachments").insert(rows);
  if (error) fail("insertAttachments", error);
}

export async function listAttachments(messageIds: string[]): Promise<AttachmentRow[]> {
  if (!messageIds.length) return [];
  const { data, error } = await db().from("chat_attachments").select("*").in("message_id", messageIds).order("created_at");
  if (error) fail("listAttachments", error);
  return (data ?? []) as AttachmentRow[];
}

/** Deletes a message's attachment rows and returns their storage paths for cleanup. */
export async function deleteAttachmentsForMessage(messageId: string): Promise<string[]> {
  const { data, error } = await db().from("chat_attachments").delete().eq("message_id", messageId).select("storage_path");
  if (error) fail("deleteAttachmentsForMessage", error);
  return (data ?? []).map((r) => r.storage_path as string);
}
