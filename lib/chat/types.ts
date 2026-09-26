// Chat domain types — pure data shapes shared by the server layer, the
// server actions and the React components. No runtime imports, so this file
// is safe on both sides of the server/client boundary.

/**
 * Every kind of signed-in person who can take part in a chat. Mirrors the
 * app-wide actor model (AuditActorType minus "system") on purpose, but is
 * declared here so the chat module doesn't depend on lib/types.ts.
 */
export type ParticipantType = "dashboard_user" | "worker" | "designer" | "client";

export const PARTICIPANT_TYPES: readonly ParticipantType[] = ["dashboard_user", "worker", "designer", "client"];

/** A reference to one person — the stable identity used everywhere in chat. */
export interface ParticipantRef {
  type: ParticipantType;
  id: string;
}

/** A person as shown in the UI. */
export interface ChatPerson extends ParticipantRef {
  name: string;
  avatarUrl: string | null;
  /** Human label for their role, e.g. "Supervisor", "Designer", "Client". */
  subtitle: string;
}

/**
 * direct  — private 1-to-1.
 * group   — named, several internal members.
 * order   — one thread per order (client + designer + joined people + staff).
 * support — one thread per client with the whole staff team.
 */
export type ConversationKind = "direct" | "group" | "order" | "support";

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  /** Resolved display title ("Order #2026-3956", the other person's name, …). */
  title: string;
  avatarUrl: string | null;
  orderId: string | null;
  clientId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderName: string | null;
  unreadCount: number;
  muted: boolean;
  /** False for staff looking at a team thread they haven't joined yet. */
  isParticipant: boolean;
}

export interface ConversationMember extends ChatPerson {
  role: "owner" | "member";
  lastReadAt: string | null;
}

export interface ConversationDetail extends ConversationSummary {
  members: ConversationMember[];
  /** The viewer's own identity, so the UI can tell "mine" apart. */
  me: ParticipantRef;
  /** What the viewer may do here — decided server-side by lib/chat/policy.ts. */
  permissions: {
    canPost: boolean;
    canManageMembers: boolean;
    canRemoveMembers: boolean;
    canRename: boolean;
    canLeave: boolean;
  };
  /**
   * Secret, per-conversation Broadcast channel for typing indicators. Only
   * handed out after an access check, so only members can listen or speak.
   */
  typingChannel: string;
}

export type AttachmentKind = "image" | "video" | "audio" | "file";

export interface ChatAttachment {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  /** Audio/video length; set for voice messages. */
  durationMs: number | null;
  /** Voice-message bar heights (0–100), measured when recorded; null otherwise. */
  waveform: number[] | null;
  /** Short-lived signed URL, minted after an access check. */
  url: string | null;
}

export type MessageKind = "text" | "attachment" | "system";

export interface ChatMessage {
  id: string;
  conversationId: string;
  kind: MessageKind;
  sender: ParticipantRef | null;
  senderName: string | null;
  body: string;
  replyTo: { id: string; senderName: string | null; body: string } | null;
  attachments: ChatAttachment[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

/** One hit from message search. */
export interface ChatSearchResult {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  conversationKind: ConversationKind;
  senderName: string | null;
  /** A short excerpt around the match. */
  snippet: string;
  createdAt: string;
}

/** Payload of a typing-indicator broadcast (client → client). */
export interface TypingSignal {
  /** participantKey() of the typist. */
  key: string;
  name: string;
  typing: boolean;
}

export const TYPING_EVENT = "typing";

/** A page of messages, oldest → newest. */
export interface MessagePage {
  messages: ChatMessage[];
  /** Pass as `before` to load the previous page; null when at the start. */
  nextCursor: string | null;
}

/** An upload the client finished, to be attached to a new message. */
export interface UploadedAttachment {
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  waveform?: number[] | null;
}

/** Everything a client needs to subscribe to its realtime doorbells. */
export interface ChatRealtimeConfig {
  channels: string[];
}

/** Payload of a realtime doorbell. Carries ids only — never content. */
export interface ChatSignal {
  type: "message" | "read" | "conversation";
  conversationId: string;
}

export const CHAT_SIGNAL_EVENT = "chat";

/** Uniform result for mutating actions. */
export type ChatResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };
