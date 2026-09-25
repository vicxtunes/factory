// Chat policy — every "who may do what" rule in one pure, dependency-free
// file. The service layer asks these questions; it never hard-codes a role
// check itself. To open chat up to a new kind of user, or change who can
// reach whom, edit the tables below — nothing else needs to change.

import type { ConversationKind, ParticipantRef, ParticipantType } from "./types";

/** Limits enforced server-side (and mirrored in the UI for early feedback). */
export const CHAT_LIMITS = {
  maxMessageLength: 4000,
  maxGroupTitleLength: 80,
  maxGroupMembers: 50,
  maxAttachmentsPerMessage: 10,
  maxAttachmentBytes: 25 * 1024 * 1024,
  messagesPerPage: 50,
  /** Message search: shortest query worth running, and max hits returned. */
  minSearchLength: 2,
  maxSearchResults: 30,
  /** Voice messages stop recording automatically after this long. */
  maxVoiceMessageMs: 5 * 60 * 1000,
  /** Signed attachment URLs live this long (seconds). */
  attachmentUrlTtl: 60 * 60,
} as const;

/**
 * MIME prefixes accepted for attachments. Audio is included so voice
 * messages (a recorded Blob) work with no further server changes.
 */
export const ALLOWED_ATTACHMENT_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.",
  "application/msword",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
] as const;

export function isAllowedAttachmentType(mimeType: string): boolean {
  return ALLOWED_ATTACHMENT_MIME_PREFIXES.some((p) => mimeType.startsWith(p));
}

/** "Staff" = dashboard accounts (receptionist / supervisor / boss). */
export function isStaff(p: ParticipantRef | ParticipantType): boolean {
  return (typeof p === "string" ? p : p.type) === "dashboard_user";
}

/**
 * Who may start a 1-to-1 conversation with whom, by participant type.
 * Read as: row type may message any type in its list.
 *
 * Staff ↔ client is intentionally absent: a client talks to "the team", not
 * one staff member, so that pairing is routed to the client's support thread
 * instead (see routeDirectConversation).
 */
const DIRECT_MESSAGE_MATRIX: Record<ParticipantType, readonly ParticipantType[]> = {
  dashboard_user: ["dashboard_user", "worker", "designer"],
  worker: ["dashboard_user", "worker", "designer"],
  designer: ["dashboard_user", "worker", "designer", "client"],
  client: ["designer"],
};

/**
 * Pairs that are type-allowed but also require an existing working
 * relationship (checked by the directory, e.g. "designer assigned to one of
 * this client's orders"). Keeps clients from browsing every designer.
 */
const RELATIONSHIP_REQUIRED: ReadonlySet<string> = new Set(["client>designer", "designer>client"]);

export function requiresRelationship(from: ParticipantType, to: ParticipantType): boolean {
  return RELATIONSHIP_REQUIRED.has(`${from}>${to}`);
}

export type DirectRoute = "direct" | "support" | "forbidden";

/**
 * Decides what "message this person" means for a pair of people:
 * a private DM, the client's support thread, or not allowed.
 */
export function routeDirectConversation(from: ParticipantRef, to: ParticipantRef): DirectRoute {
  if (from.type === to.type && from.id === to.id) return "forbidden";
  if ((from.type === "dashboard_user" && to.type === "client") || (from.type === "client" && to.type === "dashboard_user")) {
    return "support";
  }
  return DIRECT_MESSAGE_MATRIX[from.type].includes(to.type) ? "direct" : "forbidden";
}

/** The types someone may find in "New message" (before relationship checks). */
export function reachableTypes(from: ParticipantType): ParticipantType[] {
  const types = new Set<ParticipantType>(DIRECT_MESSAGE_MATRIX[from]);
  if (from === "dashboard_user") types.add("client"); // → support thread
  return [...types];
}

/** Groups are internal only: clients neither create nor join them. */
const GROUP_MEMBER_TYPES: readonly ParticipantType[] = ["dashboard_user", "worker", "designer"];

export function canCreateGroup(creator: ParticipantRef): boolean {
  return GROUP_MEMBER_TYPES.includes(creator.type);
}

export function canJoinGroup(person: ParticipantRef): boolean {
  return GROUP_MEMBER_TYPES.includes(person.type);
}

/**
 * Team threads (order/support) are visible to every staff member even
 * before they join, so nothing a client writes goes unseen.
 */
export function isTeamConversation(kind: ConversationKind): boolean {
  return kind === "order" || kind === "support";
}

/** Can this viewer read (and post to) a conversation? */
export function canAccessConversation(
  viewer: ParticipantRef,
  conversation: { kind: ConversationKind },
  isActiveMember: boolean,
): boolean {
  if (isActiveMember) return true;
  return isStaff(viewer) && isTeamConversation(conversation.kind);
}

/** Who may add/remove members. */
export function canManageMembers(
  viewer: ParticipantRef,
  conversation: { kind: ConversationKind },
  viewerRole: "owner" | "member" | null,
): boolean {
  switch (conversation.kind) {
    case "group":
      // Any member can add people (like most team chat apps); removing
      // someone else is checked separately via canRemoveMember.
      return viewerRole !== null;
    case "order":
      // Staff can pull a worker/designer into an order thread.
      return isStaff(viewer);
    default:
      return false;
  }
}

export function canRemoveMember(
  viewer: ParticipantRef,
  conversation: { kind: ConversationKind },
  viewerRole: "owner" | "member" | null,
): boolean {
  if (conversation.kind === "group") return viewerRole === "owner";
  if (conversation.kind === "order") return isStaff(viewer);
  return false;
}

/** Which types may be added to a conversation of this kind. */
export function canBeAddedTo(kind: ConversationKind, person: ParticipantRef): boolean {
  if (kind === "group") return canJoinGroup(person);
  if (kind === "order") return person.type !== "client"; // the order's own client is added automatically
  return false;
}

export function canRename(conversation: { kind: ConversationKind }, viewerRole: "owner" | "member" | null): boolean {
  return conversation.kind === "group" && viewerRole !== null;
}

/**
 * Direct threads have fixed membership. Staff may "unfollow" a support
 * thread (they keep implicit access, but stop getting notifications).
 */
export function canLeave(viewer: ParticipantRef, conversation: { kind: ConversationKind }, isActiveMember: boolean): boolean {
  if (!isActiveMember) return false;
  if (conversation.kind === "support") return isStaff(viewer);
  return conversation.kind === "group" || conversation.kind === "order";
}

/** Only the author can edit/delete their own message. */
export function canModifyMessage(viewer: ParticipantRef, message: { sender_type: string | null; sender_id: string | null }): boolean {
  return message.sender_type === viewer.type && message.sender_id === viewer.id;
}

/** Stable key for a participant — used for dedupe maps and direct_key. */
export function participantKey(p: ParticipantRef): string {
  return `${p.type}:${p.id}`;
}

/** Order-independent key identifying a 1-to-1 pair. */
export function directKey(a: ParticipantRef, b: ParticipantRef): string {
  return [participantKey(a), participantKey(b)].sort().join("|");
}
