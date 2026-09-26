import "server-only";

// Presenter — turns stored rows into the view models in ../types.ts.
// Titles are viewer-relative (a DM is titled with the *other* person's
// name; a support thread is "Support team" to the client but the client's
// name to staff), so every function here takes the viewer into account.

import { participantKey } from "../policy";
import type {
  ChatAttachment,
  ChatMessage,
  ChatPerson,
  ConversationKind,
  ConversationMember,
  ConversationSummary,
  IssueState,
  ParticipantRef,
} from "../types";
import * as directory from "./directory";
import * as repo from "./repository";
import * as storage from "./storage";

/** The minimum a conversation needs for presentation. */
interface ConversationLike {
  id: string;
  kind: ConversationKind;
  title: string | null;
  order_id: string | null;
  client_id: string | null;
}

/** Everything needed to present a batch of conversations, fetched in bulk. */
export interface PresentationContext {
  membersByConversation: Map<string, repo.ParticipantRow[]>;
  people: Map<string, ChatPerson>;
  orderNumbers: Map<string, string>;
  /** Issue threads' report status, by conversation id. */
  issues: Map<string, IssueState>;
}

export function toRef(row: { participant_type: ParticipantRef["type"]; participant_id: string }): ParticipantRef {
  return { type: row.participant_type, id: row.participant_id };
}

export function sameParticipant(a: ParticipantRef, b: ParticipantRef): boolean {
  return a.type === b.type && a.id === b.id;
}

/** Loads members, people and order numbers for many conversations at once. */
export async function buildContext(conversations: ConversationLike[]): Promise<PresentationContext> {
  const ids = conversations.map((c) => c.id);
  const members = await repo.listActiveParticipants(ids);

  const membersByConversation = new Map<string, repo.ParticipantRow[]>();
  for (const m of members) {
    if (!membersByConversation.has(m.conversation_id)) membersByConversation.set(m.conversation_id, []);
    membersByConversation.get(m.conversation_id)!.push(m);
  }

  const refs: ParticipantRef[] = members.map(toRef);
  for (const c of conversations) if (c.kind === "support" && c.client_id) refs.push({ type: "client", id: c.client_id });

  const orderIds = conversations.filter((c) => c.order_id).map((c) => c.order_id!);
  const issueIds = conversations.filter((c) => c.kind === "issue").map((c) => c.id);
  const [people, orderNumbers, issueRows] = await Promise.all([
    directory.resolvePeople(refs),
    directory.getOrderNumbers(orderIds),
    repo.getIssueStates(issueIds),
  ]);
  const issues = new Map(
    issueRows.map((r) => [r.conversation_id, { reportId: r.report_id, status: r.status, resolvedAt: r.resolved_at }]),
  );
  return { membersByConversation, people, orderNumbers, issues };
}

/** Viewer-relative title + avatar. */
export function presentConversation(
  viewer: ParticipantRef,
  c: ConversationLike,
  ctx: PresentationContext,
): { title: string; avatarUrl: string | null } {
  const members = ctx.membersByConversation.get(c.id) ?? [];
  const person = (ref: ParticipantRef) => ctx.people.get(participantKey(ref));

  switch (c.kind) {
    case "direct": {
      const other = members.map(toRef).find((m) => !sameParticipant(m, viewer));
      const p = other ? person(other) : undefined;
      return { title: p?.name ?? "Conversation", avatarUrl: p?.avatarUrl ?? null };
    }
    case "group": {
      if (c.title) return { title: c.title, avatarUrl: null };
      const names = members
        .map(toRef)
        .filter((m) => !sameParticipant(m, viewer))
        .map((m) => person(m)?.name)
        .filter(Boolean);
      return { title: names.slice(0, 3).join(", ") || "Group", avatarUrl: null };
    }
    case "order":
      return { title: `Order #${ctx.orderNumbers.get(c.order_id ?? "") ?? "—"}`, avatarUrl: null };
    case "support": {
      if (viewer.type === "client") return { title: "Support team", avatarUrl: null };
      const client = c.client_id ? person({ type: "client", id: c.client_id }) : undefined;
      return { title: client?.name ?? "Client", avatarUrl: client?.avatarUrl ?? null };
    }
    case "issue": {
      // Stored title is the start of the report. The developer, who sees
      // many of these, also gets the reporter's name in front.
      const summary = c.title ?? "Issue";
      const reporter = members.find((m) => m.role === "owner");
      if (!reporter || sameParticipant(toRef(reporter), viewer)) return { title: summary, avatarUrl: null };
      return { title: `${person(toRef(reporter))?.name ?? "Someone"}: ${summary}`, avatarUrl: null };
    }
  }
}

export function toSummary(viewer: ParticipantRef, row: repo.InboxRow, ctx: PresentationContext): ConversationSummary {
  const { title, avatarUrl } = presentConversation(viewer, row, ctx);
  return {
    id: row.id,
    kind: row.kind,
    title,
    avatarUrl,
    orderId: row.order_id,
    clientId: row.client_id,
    lastMessageAt: row.last_message_at,
    lastMessagePreview: row.last_message_preview,
    lastMessageSenderName: row.last_message_sender_name,
    unreadCount: row.unread_count,
    muted: row.muted,
    isParticipant: row.is_participant,
    issue: ctx.issues.get(row.id) ?? null,
  };
}

export function toMembers(conversationId: string, ctx: PresentationContext): ConversationMember[] {
  return (ctx.membersByConversation.get(conversationId) ?? []).map((m) => ({
    ...ctx.people.get(participantKey(toRef(m)))!,
    role: m.role,
    lastReadAt: m.last_read_at,
  }));
}

/** Short, human description of a message — used for notifications. */
export function describeMessage(body: string, attachments: { kind: ChatAttachment["kind"] }[]): string {
  if (body.trim()) return body.trim();
  const first = attachments[0]?.kind;
  if (first === "audio") return "🎤 Voice message";
  if (first === "image") return attachments.length > 1 ? `📷 ${attachments.length} photos` : "📷 Photo";
  if (first === "video") return "🎬 Video";
  return "📎 File";
}

const SNIPPET_CONTEXT = 50;

/** A one-line excerpt of `body` centred on the first match of `query`. */
export function snippetAround(body: string, query: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0 || flat.length <= SNIPPET_CONTEXT * 2 + query.length) return flat.slice(0, SNIPPET_CONTEXT * 2 + query.length);
  const start = Math.max(0, at - SNIPPET_CONTEXT);
  const end = Math.min(flat.length, at + query.length + SNIPPET_CONTEXT);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/**
 * Converts message rows into ChatMessages: attaches files (with fresh
 * signed URLs) and the quoted message for replies. Deleted messages keep
 * their place but lose their content.
 */
export async function hydrateMessages(rows: repo.MessageRow[]): Promise<ChatMessage[]> {
  const live = rows.filter((r) => !r.deleted_at);
  const attachments = await repo.listAttachments(live.map((r) => r.id));
  const urls = await storage.signedUrls(attachments.map((a) => a.storage_path));

  const byMessage = new Map<string, ChatAttachment[]>();
  for (const a of attachments) {
    if (!byMessage.has(a.message_id)) byMessage.set(a.message_id, []);
    byMessage.get(a.message_id)!.push({
      id: a.id,
      kind: a.kind,
      fileName: a.file_name,
      mimeType: a.mime_type,
      sizeBytes: a.size_bytes,
      width: a.width,
      height: a.height,
      durationMs: a.duration_ms,
      waveform: a.waveform,
      url: urls.get(a.storage_path) ?? null,
    });
  }

  const known = new Map(rows.map((r) => [r.id, r]));
  const missing = [...new Set(rows.map((r) => r.reply_to_id).filter((id): id is string => !!id && !known.has(id)))];
  for (const r of await repo.getMessagesByIds(missing)) known.set(r.id, r);

  return rows.map((r) => {
    const quoted = r.reply_to_id ? known.get(r.reply_to_id) : undefined;
    return {
      id: r.id,
      conversationId: r.conversation_id,
      kind: r.kind,
      sender: r.sender_type && r.sender_id ? { type: r.sender_type, id: r.sender_id } : null,
      senderName: r.sender_name,
      body: r.deleted_at ? "" : r.body,
      replyTo: quoted
        ? { id: quoted.id, senderName: quoted.sender_name, body: quoted.deleted_at ? "" : quoted.body }
        : null,
      attachments: r.deleted_at ? [] : (byMessage.get(r.id) ?? []),
      createdAt: r.created_at,
      editedAt: r.edited_at,
      deletedAt: r.deleted_at,
    };
  });
}
