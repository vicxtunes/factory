import "server-only";

// Realtime adapter — "doorbells", not data.
//
// Why not postgres_changes like the rest of the app? Workers, designers and
// clients connect to Supabase as `anon`, so any table they could subscribe to
// would be readable by anyone with the public anon key. Instead:
//
//   1. Each person gets a private Broadcast channel whose name is an HMAC of
//      their identity (unguessable without APP_SECRET). Staff additionally
//      share one team channel for order/support threads.
//   2. After a write, the server rings the relevant channels with ids only:
//      { type: "message", conversationId }.
//   3. The browser reacts by re-fetching through the normal, access-checked
//      server actions. No message content ever crosses the channel.
//
// Delivery is best-effort: a failed ring never fails the write, and the
// client also refreshes on focus/interval (see lib/chat/client/useChatSignals).

import { createHmac } from "crypto";

import { isStaff, participantKey } from "../policy";
import { CHAT_SIGNAL_EVENT, type ChatSignal, type ParticipantRef } from "../types";

function secret(): string {
  const s = process.env.APP_SECRET;
  if (!s) throw new Error("APP_SECRET is not set");
  return s;
}

function channelFor(label: string): string {
  const digest = createHmac("sha256", secret()).update(`chat-channel:${label}`).digest("hex").slice(0, 40);
  return `chat-${digest}`;
}

/** A person's private doorbell channel. */
export function personalChannel(p: ParticipantRef): string {
  return channelFor(participantKey(p));
}

/** Shared by all staff — rings for order/support threads they haven't joined. */
export function staffTeamChannel(): string {
  return channelFor("team:staff");
}

/**
 * A conversation's typing-indicator channel. Unlike the doorbells, browsers
 * broadcast on this one directly (client → client), so the name is only
 * given to people who passed the conversation's access check.
 */
export function conversationChannel(conversationId: string): string {
  return channelFor(`conversation:${conversationId}`);
}

/** Channels the given viewer should subscribe to. */
export function channelsFor(viewer: ParticipantRef): string[] {
  return isStaff(viewer) ? [personalChannel(viewer), staffTeamChannel()] : [personalChannel(viewer)];
}

/**
 * Rings every given channel with the same signal in a single HTTP request,
 * via Supabase Realtime's REST broadcast endpoint (server-side, no socket).
 */
export async function ringChannels(channels: string[], signal: ChatSignal): Promise<void> {
  const unique = [...new Set(channels)];
  if (!unique.length) return;
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        messages: unique.map((topic) => ({ topic, event: CHAT_SIGNAL_EVENT, payload: signal })),
      }),
    });
    if (!res.ok) console.error("chat signal broadcast failed:", res.status, await res.text());
  } catch (err) {
    console.error("chat signal broadcast threw:", err);
  }
}

/** Convenience: ring a set of people (plus the staff team channel if asked). */
export async function ringPeople(people: ParticipantRef[], signal: ChatSignal, includeStaffTeam = false): Promise<void> {
  const channels = people.map(personalChannel);
  if (includeStaffTeam) channels.push(staffTeamChannel());
  await ringChannels(channels, signal);
}
