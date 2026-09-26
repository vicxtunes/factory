"use client";

// Subscribes the browser to its chat "doorbells" (see server/signals.ts) and
// calls `onSignal` whenever something changed. Also fires a synthetic
// "refresh" when the tab regains focus or comes back online, and on a slow
// interval — so the UI self-heals if a realtime message is ever missed.
//
// Several components listen at once (the header badge and the chat page,
// say). The browser Supabase client is a singleton and returns the *same*
// channel object for a repeated topic, so each hook subscribing on its own
// would double-subscribe, and one unmounting would tear down the other's
// channel. Instead, all hooks share one reference-counted hub: the first
// listener opens the channels, the last one to leave closes them.

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/browser";

import { getRealtimeConfig } from "../actions";
import { CHAT_SIGNAL_EVENT, type ChatSignal } from "../types";

const FALLBACK_REFRESH_MS = 60_000;

export type ChatSignalHandler = (signal: ChatSignal | { type: "refresh" }) => void;

// --- Shared hub (module scope: one per page) -------------------------------

const listeners = new Set<(signal: ChatSignal) => void>();
let teardown: (() => void) | null = null;
let connecting = false;

async function connect(): Promise<void> {
  connecting = true;
  const res = await getRealtimeConfig();
  connecting = false;
  // Everyone may have unmounted while the config was loading.
  if (!res.ok || listeners.size === 0 || teardown) return;

  const supabase = createClient();
  const channels = res.data.channels.map((name) =>
    supabase
      .channel(name)
      .on("broadcast", { event: CHAT_SIGNAL_EVENT }, ({ payload }) => {
        listeners.forEach((listener) => listener(payload as ChatSignal));
      })
      .subscribe(),
  );
  teardown = () => channels.forEach((c) => supabase.removeChannel(c));
}

function addListener(listener: (signal: ChatSignal) => void): () => void {
  listeners.add(listener);
  if (!teardown && !connecting) connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && teardown) {
      teardown();
      teardown = null;
    }
  };
}

// --- Hook -------------------------------------------------------------------

export function useChatSignals(onSignal: ChatSignalHandler, enabled = true): void {
  const handlerRef = useRef(onSignal);
  useEffect(() => {
    handlerRef.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    if (!enabled) return;
    const removeListener = addListener((signal) => handlerRef.current(signal));

    const refresh = () => {
      if (document.visibilityState === "visible") handlerRef.current({ type: "refresh" });
    };
    const interval = window.setInterval(refresh, FALLBACK_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);

    return () => {
      removeListener();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [enabled]);
}
