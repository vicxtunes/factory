import "server-only";

// Identity adapter — the ONLY place the chat module touches the app's auth.
// The app has four independent sign-in systems (Supabase Auth for staff,
// signed PIN cookies for workers/designers, a client cookie); resolveActor()
// already unifies them, so chat just maps its answer onto a ParticipantRef.
// If authentication ever changes, this is the one file to update.

import { resolveActor } from "@/lib/audit/log";

import type { ParticipantRef, ParticipantType } from "../types";

export interface ChatViewer extends ParticipantRef {
  name: string;
  /** Staff role ("boss", "supervisor", …) when the viewer is a dashboard user. */
  role?: string;
}

const CHAT_TYPES: ReadonlySet<string> = new Set<ParticipantType>(["dashboard_user", "worker", "designer", "client"]);

/** The signed-in person, or null when nobody (or a non-chat actor) is signed in. */
export async function getChatViewer(): Promise<ChatViewer | null> {
  const actor = await resolveActor();
  if (!actor || !CHAT_TYPES.has(actor.type)) return null;
  return { type: actor.type as ParticipantType, id: actor.id, name: actor.name, role: actor.role };
}

/** Like getChatViewer, but throws for anonymous callers. */
export async function requireChatViewer(): Promise<ChatViewer> {
  const viewer = await getChatViewer();
  if (!viewer) throw new ChatError("Please sign in to use chat.");
  return viewer;
}

/**
 * An error whose message is safe to show the user. The action layer turns
 * these into `{ ok: false, error }`; any other error is logged and replaced
 * with a generic message so internals never leak to the browser.
 */
export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
  }
}
