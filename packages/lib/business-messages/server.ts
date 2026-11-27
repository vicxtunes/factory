import "server-only";

// Business messages (./core.ts): who may read and write each chat, its
// messages and files, the live "doorbells" and the phone notifications.
//
// Two kinds of viewer, each checked from their own sign-in, never from what
// the browser says:
//   - the business: its owner, or a team member with Clients (studios/server),
//     on a Pro business; every chat of the business is theirs to answer;
//   - the client: signed in on the business's page (phone + PIN, studio-portal),
//     reaching only their own chats.
// Tables: supabase/migrations/20270129100000_business_chats.sql. Files go to
// Aming chat's private bucket under business/<chat id>/, read through signed links.

import { createHmac, randomUUID } from "node:crypto";

import webpush from "web-push";

import { CHAT_LIMITS, isAllowedAttachmentType, sanitizeWaveform } from "@repo/lib/chat/policy";
import type { AttachmentKind, ChatAttachment, ChatMessage, UploadedAttachment } from "@repo/lib/chat/types";
import { isPro } from "@repo/lib/pro/core";
import { proStatus } from "@repo/lib/pro/server";
import { photos } from "@repo/lib/photos/server";
import { notifyActor } from "@repo/lib/push/send";
import { ensureVapidConfigured } from "@repo/lib/push/vapid";
import { safeStorageSegment } from "@repo/lib/storage/client";
import { studioAccess } from "@repo/lib/studio-access/server";
import { portal, portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";
import { studioScope, type Studio } from "@repo/lib/studios/core";
import { studioOfCaller } from "@repo/lib/studios/server";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { team } from "@repo/lib/team/server";

import { SIGNAL_EVENT, senderRef, type BizChatSummary, type BizThread, type LeadView, type Side } from "./core";
import { leadsOfChats } from "./leads";
import { answerSoon } from "./sales";

/** A refusal whose words can be shown. */
export class BizChatError extends Error {}

export type Viewer =
  | { side: "business"; studio: Studio; clientId: string; name: string }
  | { side: "customer"; studio: Studio; customerId: string; name: string; slug: string };

const BUCKET = "chat-attachments";
const db = () => createAdminClient();

// ── Who's asking ──────────────────────────────────────────────────────────

/**
 * While it's tried out, only these businesses have Messages (owner, 2026-11-27:
 * "we only testing this with Saniget Multimedia"; Dementa Studios added
 * 2026-11-28 so the owner tests Leads and ads on their own business). Empty: every Pro business.
 */
const TRYING = ["7363e5a4-c8f2-4f02-9c63-9edf89f1e726", "f96d806b-1bb8-4c27-9f10-8d99c8b80a2a"];

/** Whether this business has Messages: Pro, and (while tried out) on the list above. */
export async function messagesOn(tenantId: string): Promise<boolean> {
  if (TRYING.length && !TRYING.includes(tenantId)) return false;
  return isPro(await proStatus(tenantId));
}

async function mustBePro(studio: Studio) {
  if (!(await messagesOn(studio.id))) throw new BizChatError("Messages are part of Pro.");
}

/** The business's person: the owner, or a member with Clients. */
export async function businessViewer(): Promise<Viewer & { side: "business" }> {
  const caller = await studioOfCaller("clients", "view").catch(() => null);
  if (!caller) throw new BizChatError("Sign in to your business to see its messages.");
  await mustBePro(caller.studio);
  return { side: "business", studio: caller.studio, clientId: caller.session.client_id, name: caller.session.name };
}

/** The business's client, signed in on its page. */
export async function customerViewer(slug: unknown): Promise<Viewer & { side: "customer" }> {
  const at = typeof slug === "string" ? await studioAtSlug(slug.slice(0, 80)) : null;
  if (!at) throw new BizChatError("This business isn't here any more.");
  const me = await portalClient(at.studio.id);
  if (!me) throw new BizChatError("Sign in again to see your messages.");
  await mustBePro(at.studio);
  return { side: "customer", studio: at.studio, customerId: me.customerId, name: me.name, slug: at.redirectTo ?? (slug as string) };
}

// ── Rows ──────────────────────────────────────────────────────────────────

export type ChatRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  project_id: string | null;
  last_message_at: string | null;
  last_preview: string | null;
  last_from: Side | null;
  business_read_at: string | null;
  customer_read_at: string | null;
  assistant_paused: boolean;
};
/** A sample Alexis showed from the business's public photos (./sales.ts): read through the photos module, not the chat's files. */
export type SampleRef = { albumId: string; photoId?: string; video?: true };
type StoredAttachment = { path: string; kind: AttachmentKind; fileName: string; mimeType: string | null; sizeBytes: number | null; width: number | null; height: number | null; durationMs: number | null; waveform: number[] | null; sample?: SampleRef };
type MessageRow = {
  id: string;
  chat_id: string;
  from_side: Side;
  sender_name: string;
  sender_client_id: string | null;
  body: string;
  reply_to_id: string | null;
  attachments: StoredAttachment[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  by_assistant: boolean;
};

const CHAT_COLUMNS = "id, tenant_id, customer_id, project_id, last_message_at, last_preview, last_from, business_read_at, customer_read_at, assistant_paused";
const MESSAGE_COLUMNS = "id, chat_id, from_side, sender_name, sender_client_id, body, reply_to_id, attachments, created_at, edited_at, deleted_at, by_assistant";
const other = (side: Side): Side => (side === "business" ? "customer" : "business");
const readAt = (c: ChatRow, side: Side) => (side === "business" ? c.business_read_at : c.customer_read_at);

/** A chat the viewer may open, or a refusal. */
async function chatFor(v: Viewer, chatId: unknown): Promise<ChatRow> {
  if (typeof chatId !== "string" || !/^[0-9a-f-]{36}$/.test(chatId)) throw new BizChatError("That chat isn't here.");
  let q = db().from("business_chats").select(CHAT_COLUMNS).eq("id", chatId).eq("tenant_id", v.studio.id);
  if (v.side === "customer") q = q.eq("customer_id", v.customerId);
  const { data } = await q.maybeSingle<ChatRow>();
  if (!data) throw new BizChatError("That chat isn't here.");
  return data;
}

/** Names for the chats in a list: clients, projects, and the business's logo for its clients. */
async function summaries(v: Viewer, rows: ChatRow[]): Promise<BizChatSummary[]> {
  if (!rows.length) return [];
  const customerIds = [...new Set(rows.map((r) => r.customer_id))];
  const projectIds = [...new Set(rows.flatMap((r) => (r.project_id ? [r.project_id] : [])))];
  const [{ data: people }, { data: projs }, logo, unread, leads] = await Promise.all([
    db().from("customers").select("id, name").in("id", customerIds).returns<{ id: string; name: string }[]>(),
    projectIds.length ? db().from("projects").select("id, title").in("id", projectIds).returns<{ id: string; title: string }[]>() : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    v.side === "customer" ? studioAccess.logoUrl(v.studio.logoKey) : Promise.resolve(null),
    unreadCounts(v.side, rows),
    v.side === "business" ? leadsOfChats(v.studio.id, rows.map((r) => r.id)) : Promise.resolve(new Map<string, LeadView>()),
  ]);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.name]));
  const titleOf = new Map((projs ?? []).map((p) => [p.id, p.title]));
  return rows.map((r) => ({
    id: r.id,
    customerId: r.customer_id,
    title: v.side === "business" ? (nameOf.get(r.customer_id) ?? "Client") : v.studio.name,
    projectId: r.project_id,
    projectTitle: r.project_id ? (titleOf.get(r.project_id) ?? "Project") : null,
    avatarUrl: logo,
    lastMessageAt: r.last_message_at,
    lastPreview: r.last_preview,
    lastMine: r.last_from === v.side,
    unread: unread.get(r.id) ?? 0,
    lead: leads.get(r.id) ?? null,
    assistantPaused: r.assistant_paused,
  }));
}

/** Messages from the other side the viewer hasn't read, per chat (only chats whose last message is theirs can have any). */
async function unreadCounts(side: Side, rows: ChatRow[]): Promise<Map<string, number>> {
  const waiting = rows.filter((r) => r.last_from === other(side) && r.last_message_at && (!readAt(r, side) || r.last_message_at > readAt(r, side)!));
  const counts = await Promise.all(
    waiting.map(async (r) => {
      let q = db().from("business_chat_messages").select("id", { count: "exact", head: true }).eq("chat_id", r.id).eq("from_side", other(side)).is("deleted_at", null);
      const since = readAt(r, side);
      if (since) q = q.gt("created_at", since);
      const { count } = await q;
      return [r.id, count ?? 1] as const;
    }),
  );
  return new Map(counts);
}

// ── Lists and opening ─────────────────────────────────────────────────────

/** The viewer's chats, newest first. The business sees chats with messages; a client also sees their general chat and one per project, ready to write in. */
export async function listChats(v: Viewer): Promise<BizChatSummary[]> {
  if (v.side === "customer") await ensureCustomerChats(v);
  let q = db().from("business_chats").select(CHAT_COLUMNS).eq("tenant_id", v.studio.id);
  q = v.side === "customer" ? q.eq("customer_id", v.customerId) : q.not("last_message_at", "is", null);
  const { data, error } = await q.order("last_message_at", { ascending: false, nullsFirst: false }).limit(300).returns<ChatRow[]>();
  if (error) throw new Error(`business chats: ${error.message}`);
  return summaries(v, data);
}

async function ensureCustomerChats(v: Viewer & { side: "customer" }) {
  const { data: projs } = await db().from("projects").select("id").eq("tenant_id", v.studio.id).eq("customer_id", v.customerId).returns<{ id: string }[]>();
  await upsertChat(v.studio.id, v.customerId, null);
  await Promise.all((projs ?? []).map((p) => upsertChat(v.studio.id, v.customerId, p.id)));
}

/** The chat for a client (and project), made the first time. */
export async function upsertChat(tenantId: string, customerId: string, projectId: string | null): Promise<string> {
  const find = () => {
    const q = db().from("business_chats").select("id").eq("tenant_id", tenantId).eq("customer_id", customerId);
    return (projectId ? q.eq("project_id", projectId) : q.is("project_id", null)).maybeSingle<{ id: string }>();
  };
  const found = (await find()).data;
  if (found) return found.id;
  const { data, error } = await db().from("business_chats").insert({ tenant_id: tenantId, customer_id: customerId, project_id: projectId }).select("id").single<{ id: string }>();
  if (data) return data.id;
  // Made at the same moment by someone else.
  const again = (await find()).data;
  if (again) return again.id;
  throw new Error(`business chats: couldn't open the chat: ${error?.message}`);
}

/** Opens a client's chat (or one of their projects') from the business side. */
export async function openChat(v: Viewer, customerId: unknown, projectId: unknown): Promise<string> {
  if (typeof customerId !== "string" || !/^[0-9a-f-]{36}$/.test(customerId)) throw new BizChatError("Pick a client.");
  const { data: who } = await db().from("customers").select("id").eq("id", customerId).eq("tenant_id", v.studio.id).maybeSingle();
  if (!who) throw new BizChatError("That client isn't here.");
  if (v.side === "customer" && v.customerId !== customerId) throw new BizChatError("That chat isn't here.");
  let project: string | null = null;
  if (projectId) {
    const { data: p } = await db().from("projects").select("id").eq("id", String(projectId)).eq("tenant_id", v.studio.id).eq("customer_id", customerId).maybeSingle<{ id: string }>();
    if (!p) throw new BizChatError("That project isn't this client's.");
    project = p.id;
  }
  return upsertChat(v.studio.id, customerId, project);
}

/** The business's clients, to start a chat with. */
export async function clientsToMessage(v: Viewer): Promise<{ id: string; name: string; phone: string | null }[]> {
  const { data } = await db().from("customers").select("id, name, phone").eq("tenant_id", v.studio.id).is("archived_at", null).order("name").limit(2000).returns<{ id: string; name: string; phone: string | null }[]>();
  return data ?? [];
}

// ── A chat's messages ─────────────────────────────────────────────────────

export async function thread(v: Viewer, chatId: unknown, before?: unknown): Promise<BizThread> {
  const chat = await chatFor(v, chatId);
  let q = db().from("business_chat_messages").select(MESSAGE_COLUMNS).eq("chat_id", chat.id);
  if (typeof before === "string" && before) q = q.lt("created_at", before);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(CHAT_LIMITS.messagesPerPage + 1).returns<MessageRow[]>();
  if (error) throw new Error(`business chats: ${error.message}`);
  const more = data.length > CHAT_LIMITS.messagesPerPage;
  const rows = data.slice(0, CHAT_LIMITS.messagesPerPage).reverse();
  const [summary] = await summaries(v, [chat]);
  return {
    chat: summary,
    side: v.side,
    meClientId: v.side === "business" ? v.clientId : null,
    messages: await present(v, rows),
    nextCursor: more ? rows[0].created_at : null,
    otherReadAt: readAt(chat, other(v.side)),
    typingChannel: typingTopic(chat.id),
  };
}

/** Rows → Aming chat's message shape, with signed links to files and the messages they answer. */
async function present(v: Viewer, rows: MessageRow[]): Promise<ChatMessage[]> {
  const replyIds = [...new Set(rows.flatMap((r) => (r.reply_to_id ? [r.reply_to_id] : [])))];
  const { data: replies } = replyIds.length
    ? await db().from("business_chat_messages").select(MESSAGE_COLUMNS).in("id", replyIds).returns<MessageRow[]>()
    : { data: [] as MessageRow[] };
  const replyOf = new Map((replies ?? []).map((r) => [r.id, r]));
  const paths = rows.flatMap((r) => (r.deleted_at ? [] : r.attachments.flatMap((a) => (a.path ? [a.path] : []))));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await db().storage.from(BUCKET).createSignedUrls(paths, CHAT_LIMITS.attachmentUrlTtl);
    for (const s of data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const samples = await sampleUrls(v, rows);
  // The business's clients see the business's name on its messages (its assistant's marked so); its team sees who wrote.
  const nameFor = (r: MessageRow) => (v.side === "customer" && r.from_side === "business" ? (r.by_assistant ? `${v.studio.name} · assistant` : v.studio.name) : r.sender_name);
  return rows.map((r) => {
    const reply = r.reply_to_id ? replyOf.get(r.reply_to_id) : null;
    const attachments: ChatAttachment[] = r.deleted_at
      ? []
      : r.attachments.map((a, i) => ({ id: `${r.id}-${i}`, kind: a.kind, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, width: a.width, height: a.height, durationMs: a.durationMs, waveform: a.waveform, url: (a.sample ? samples.get(sampleKey(a.sample)) : urls.get(a.path)) ?? null }));
    return {
      id: r.id,
      conversationId: r.chat_id,
      kind: attachments.length ? "attachment" : "text",
      card: null,
      sender: senderRef(r.from_side, r.from_side === "business" ? r.sender_client_id : null),
      senderName: nameFor(r),
      body: r.deleted_at ? "" : r.body,
      replyTo: reply ? { id: reply.id, senderName: nameFor(reply), body: reply.deleted_at ? "" : reply.body } : null,
      attachments,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      deletedAt: r.deleted_at,
    };
  });
}

const sampleKey = (s: SampleRef) => `${s.albumId}:${s.photoId ?? "video"}`;

/** Fresh links to the samples Alexis showed: the album's photos, or its preview video. */
async function sampleUrls(v: Viewer, rows: MessageRow[]): Promise<Map<string, string>> {
  const refs = rows.flatMap((r) => (r.deleted_at ? [] : r.attachments.flatMap((a) => (a.sample ? [a.sample] : []))));
  const out = new Map<string, string>();
  if (!refs.length) return out;
  const scope = studioScope(v.studio);
  for (const albumId of [...new Set(refs.map((r) => r.albumId))]) {
    try {
      const mine = refs.filter((r) => r.albumId === albumId);
      if (mine.some((r) => r.photoId)) {
        for (const p of await photos.photos(scope, albumId)) out.set(`${albumId}:${p.id}`, p.largeUrl);
      }
      if (mine.some((r) => r.video)) {
        const album = await photos.album(scope, albumId);
        if (album?.videoUrl) out.set(`${albumId}:video`, album.videoUrl);
      }
    } catch (err) {
      console.error("business chats: sample links failed:", albumId, err);
    }
  }
  return out;
}

const preview = (body: string, attachments: StoredAttachment[]) =>
  body.trim().slice(0, 140) || (attachments[0]?.kind === "audio" ? "🎤 Voice message" : attachments[0]?.kind === "image" ? "📷 Photo" : attachments[0]?.kind === "video" ? "🎥 Video" : "📎 File");

export async function send(v: Viewer, chatId: unknown, input: { body?: unknown; replyToId?: unknown; attachments?: unknown }): Promise<ChatMessage> {
  const chat = await chatFor(v, chatId);
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (body.length > CHAT_LIMITS.maxMessageLength) throw new BizChatError(`Messages can be at most ${CHAT_LIMITS.maxMessageLength} characters.`);
  const attachments = await checkedAttachments(chat.id, input.attachments);
  if (!body && !attachments.length) throw new BizChatError("Write a message first.");
  let replyTo: string | null = null;
  if (typeof input.replyToId === "string" && input.replyToId) {
    const { data } = await db().from("business_chat_messages").select("id").eq("id", input.replyToId).eq("chat_id", chat.id).maybeSingle<{ id: string }>();
    replyTo = data?.id ?? null;
  }
  const { data: row, error } = await db()
    .from("business_chat_messages")
    .insert({ chat_id: chat.id, from_side: v.side, sender_name: v.name, sender_client_id: v.side === "business" ? v.clientId : null, body, reply_to_id: replyTo, attachments })
    .select(MESSAGE_COLUMNS)
    .single<MessageRow>();
  if (error || !row) throw new Error(`business chats: couldn't send: ${error?.message}`);
  const mineRead = v.side === "business" ? { business_read_at: row.created_at } : { customer_read_at: row.created_at };
  // Someone from the team writes: Alexis steps back in this chat until they hand it back.
  const takeOver = v.side === "business" && !chat.assistant_paused ? { assistant_paused: true } : {};
  await db().from("business_chats").update({ last_message_at: row.created_at, last_preview: preview(body, attachments), last_from: v.side, ...mineRead, ...takeOver }).eq("id", chat.id);
  await ring(chat);
  await tell(v, chat, preview(body, attachments));
  // The client wrote: Alexis answers at once in a lead's chat (./sales.ts decides whether she may).
  if (v.side === "customer") answerSoon(chat.id);
  return (await present(v, [row]))[0];
}

/** Files the browser says it uploaded: under this chat's folder, really there, of an allowed kind. */
async function checkedAttachments(chatId: string, raw: unknown): Promise<StoredAttachment[]> {
  if (!Array.isArray(raw) || !raw.length) return [];
  if (raw.length > CHAT_LIMITS.maxAttachmentsPerMessage) throw new BizChatError(`At most ${CHAT_LIMITS.maxAttachmentsPerMessage} files a message.`);
  return Promise.all(
    (raw as UploadedAttachment[]).map(async (a) => {
      if (typeof a?.path !== "string" || !a.path.startsWith(`business/${chatId}/`)) throw new BizChatError("A file didn't upload. Try again.");
      const slash = a.path.lastIndexOf("/");
      const { data } = await db().storage.from(BUCKET).list(a.path.slice(0, slash), { search: a.path.slice(slash + 1), limit: 5 });
      const found = data?.find((f) => f.name === a.path.slice(slash + 1));
      if (!found) throw new BizChatError("A file didn't upload. Try again.");
      const mimeType = (found.metadata?.mimetype as string | undefined) ?? a.mimeType ?? "application/octet-stream";
      const kind: AttachmentKind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : mimeType.startsWith("audio/") ? "audio" : "file";
      const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null);
      return {
        path: a.path,
        kind,
        fileName: String(a.fileName ?? "file").slice(0, 200),
        mimeType,
        sizeBytes: (found.metadata?.size as number | undefined) ?? num(a.sizeBytes),
        width: num(a.width),
        height: num(a.height),
        durationMs: num(a.durationMs),
        waveform: sanitizeWaveform(a.waveform),
      };
    }),
  );
}

/** A signed upload into the chat's folder; the file goes straight to storage. */
export async function startUpload(v: Viewer, chatId: unknown, input: { fileName?: unknown; mimeType?: unknown; sizeBytes?: unknown }) {
  const chat = await chatFor(v, chatId);
  const mimeType = String(input.mimeType ?? "");
  if (!isAllowedAttachmentType(mimeType)) throw new BizChatError("That kind of file can't be sent.");
  if (typeof input.sizeBytes !== "number" || input.sizeBytes > CHAT_LIMITS.maxAttachmentBytes) throw new BizChatError(`Files can be at most ${CHAT_LIMITS.maxAttachmentBytes / 1024 / 1024} MB.`);
  const path = `business/${chat.id}/${randomUUID()}-${safeStorageSegment(String(input.fileName ?? "file"))}`;
  const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`business chats: upload: ${error?.message}`);
  return { path: data.path, token: data.token, bucket: BUCKET };
}

/** Only the writer edits or deletes: the client their own, a business person their own. */
async function ownMessage(v: Viewer, messageId: unknown): Promise<{ row: MessageRow; chat: ChatRow }> {
  if (typeof messageId !== "string" || !/^[0-9a-f-]{36}$/.test(messageId)) throw new BizChatError("That message isn't here.");
  const { data: row } = await db().from("business_chat_messages").select(MESSAGE_COLUMNS).eq("id", messageId).maybeSingle<MessageRow>();
  if (!row) throw new BizChatError("That message isn't here.");
  const chat = await chatFor(v, row.chat_id);
  const mine = row.from_side === v.side && (v.side === "customer" || row.sender_client_id === v.clientId);
  if (!mine || row.deleted_at) throw new BizChatError("You can only change your own messages.");
  return { row, chat };
}

export async function edit(v: Viewer, messageId: unknown, body: unknown) {
  const { row, chat } = await ownMessage(v, messageId);
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) throw new BizChatError("Write something, or delete the message.");
  if (text.length > CHAT_LIMITS.maxMessageLength) throw new BizChatError(`Messages can be at most ${CHAT_LIMITS.maxMessageLength} characters.`);
  if (row.attachments.length) throw new BizChatError("Messages with files can't be edited.");
  await db().from("business_chat_messages").update({ body: text, edited_at: new Date().toISOString() }).eq("id", row.id);
  if (chat.last_message_at === row.created_at) await db().from("business_chats").update({ last_preview: text.slice(0, 140) }).eq("id", chat.id);
  await ring(chat);
}

export async function remove(v: Viewer, messageId: unknown) {
  const { row, chat } = await ownMessage(v, messageId);
  await db().from("business_chat_messages").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
  if (chat.last_message_at === row.created_at) await db().from("business_chats").update({ last_preview: "Message deleted" }).eq("id", chat.id);
  const paths = row.attachments.flatMap((a) => (a.path ? [a.path] : []));
  if (paths.length) await db().storage.from(BUCKET).remove(paths);
  await ring(chat);
}

/** The viewer has read the chat: the other side's ✓✓ turn on. */
export async function markRead(v: Viewer, chatId: unknown) {
  const chat = await chatFor(v, chatId);
  if (chat.last_from !== other(v.side)) return;
  const now = new Date().toISOString();
  await db().from("business_chats").update(v.side === "business" ? { business_read_at: now } : { customer_read_at: now }).eq("id", chat.id);
  await ring(chat);
}

/** The team hands a chat to Alexis, or takes it from her. */
export async function setAssistantPaused(v: Viewer, chatId: unknown, paused: boolean): Promise<void> {
  if (v.side !== "business") throw new BizChatError("That chat isn't here.");
  const chat = await chatFor(v, chatId);
  await db().from("business_chats").update({ assistant_paused: paused }).eq("id", chat.id);
  await ring(chat);
  if (!paused && chat.last_from === "customer") answerSoon(chat.id);
}

// ── Live updates ──────────────────────────────────────────────────────────

// Doorbells, as Aming chat does (packages/lib/chat/server/signals.ts): an
// unguessable channel per business and per client; the server rings it with
// the chat's id only, and the browser fetches through the checks above.

/** A chat's typing… channel (Alexis types too, from ./sales.ts). */
export const typingTopic = (chatId: string) => channel(`typing:${chatId}`);

function channel(label: string): string {
  const s = process.env.APP_SECRET;
  if (!s) throw new Error("APP_SECRET is not set");
  return `bchat-${createHmac("sha256", s).update(`business-chat:${label}`).digest("hex").slice(0, 40)}`;
}

/** Where the viewer's list hears about changes. */
export function inboxChannel(v: Viewer): string {
  return v.side === "business" ? channel(`business:${v.studio.id}`) : channel(`customer:${v.customerId}`);
}

export async function ring(chat: ChatRow): Promise<void> {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const topics = [channel(`business:${chat.tenant_id}`), channel(`customer:${chat.customer_id}`)];
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: topics.map((topic) => ({ topic, event: SIGNAL_EVENT, payload: { chatId: chat.id } })) }),
    });
    if (!res.ok) console.error("business chat signal failed:", res.status);
  } catch (err) {
    console.error("business chat signal threw:", err);
  }
}

// ── Notifications ─────────────────────────────────────────────────────────

/** Tells the other side: the business's people (owner and members with Clients), or the client's phones. */
export async function tell(v: Viewer, chat: ChatRow, text: string): Promise<void> {
  try {
    if (v.side === "customer") {
      const { data: proj } = chat.project_id ? await db().from("projects").select("title").eq("id", chat.project_id).maybeSingle<{ title: string }>() : { data: null };
      const members = await team.active(studioScope(v.studio)).catch(() => []);
      const people = [v.studio.ownerClientId, ...members.filter((m) => m.accountId && m.access.clients !== "none").map((m) => m.accountId!)];
      const payload = { title: proj ? `${v.name} · ${proj.title}` : v.name, body: text, url: `/studio/messages?c=${chat.id}` };
      await Promise.all([...new Set(people)].map((id) => notifyActor({ type: "client", id }, payload, { inbox: false })));
      return;
    }
    const { data: devices } = await db().from("business_chat_devices").select("endpoint, p256dh, auth").eq("customer_id", chat.customer_id).returns<{ endpoint: string; p256dh: string; auth: string }[]>();
    if (!devices?.length) return;
    const slug = (await portal.currentSlug(chat.tenant_id).catch(() => null)) ?? "";
    ensureVapidConfigured();
    const payload = JSON.stringify({ title: v.studio.name, body: text, url: `/${slug}/messages?c=${chat.id}` });
    await Promise.all(
      devices.map((d) =>
        webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload).catch(async (err: { statusCode?: number }) => {
          if (err.statusCode === 404 || err.statusCode === 410 || err.statusCode === 403) await db().from("business_chat_devices").delete().eq("customer_id", chat.customer_id).eq("endpoint", d.endpoint);
        }),
      ),
    );
  } catch (err) {
    console.error("business chat notify failed:", err);
  }
}

/** Saves this phone for the client's notifications. */
export async function saveDevice(v: Viewer & { side: "customer" }, sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }) {
  const { endpoint, keys } = sub ?? {};
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") throw new BizChatError("This phone can't get notifications.");
  await db().from("business_chat_devices").upsert({ customer_id: v.customerId, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: "customer_id,endpoint" });
}
