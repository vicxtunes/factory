"use client";

// Typing indicators for one open conversation.
//
// Unlike the doorbells (server → browser), typing is browser → browser:
// each client broadcasts on the conversation's secret channel, which the
// server only reveals after an access check (ConversationDetail.typingChannel).
// Nothing is stored; a typist silently "expires" if their signals stop.
//
// Only the open conversation view uses this, so there's one subscriber per
// channel name — no sharing needed (compare useChatSignals).

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/browser";

import { TYPING_EVENT, type TypingSignal } from "../types";

/** Re-announce "still typing" at most this often while keys are pressed. */
const SEND_INTERVAL_MS = 2500;
/** Forget a typist this long after their last signal. */
const EXPIRE_MS = 6000;

export function useTypingIndicator(channelName: string | null, me: { key: string; name: string } | null) {
  const [typists, setTypists] = useState<Map<string, { name: string; until: number }>>(new Map());
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const joinedRef = useRef(false);
  const lastSentRef = useRef(0);
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(() => {
    if (!channelName) return;
    const supabase = createClient();
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: TYPING_EVENT }, ({ payload }) => {
        const signal = payload as TypingSignal;
        if (signal.key === meRef.current?.key) return;
        setTypists((prev) => {
          const next = new Map(prev);
          if (signal.typing) next.set(signal.key, { name: signal.name, until: Date.now() + EXPIRE_MS });
          else next.delete(signal.key);
          return next;
        });
      })
      .subscribe((status) => {
        joinedRef.current = status === "SUBSCRIBED";
      });
    channelRef.current = channel;

    // Sweep out typists whose signals stopped (closed tab, lost connection).
    const sweep = window.setInterval(() => {
      setTypists((prev) => {
        const now = Date.now();
        if (![...prev.values()].some((t) => t.until <= now)) return prev;
        return new Map([...prev].filter(([, t]) => t.until > now));
      });
    }, 1000);

    return () => {
      window.clearInterval(sweep);
      joinedRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [channelName]);

  const send = useCallback((typing: boolean) => {
    const channel = channelRef.current;
    const self = meRef.current;
    if (!channel || !joinedRef.current || !self) return;
    channel.send({ type: "broadcast", event: TYPING_EVENT, payload: { key: self.key, name: self.name, typing } satisfies TypingSignal });
  }, []);

  /** Call on every keystroke; throttled internally. */
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < SEND_INTERVAL_MS) return;
    lastSentRef.current = now;
    send(true);
  }, [send]);

  /** Call when a message is sent or the draft is cleared. */
  const notifyStopped = useCallback(() => {
    if (!lastSentRef.current) return;
    lastSentRef.current = 0;
    send(false);
  }, [send]);

  return { typingNames: [...typists.values()].map((t) => t.name), notifyTyping, notifyStopped };
}

/** "Priya is typing…", "Priya and Kofi are typing…", "3 people are typing…". */
export function describeTyping(names: string[]): string | null {
  if (!names.length) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}
