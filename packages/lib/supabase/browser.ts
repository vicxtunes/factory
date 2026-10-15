"use client";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// Anon client for the browser: RLS-guarded reads + Realtime subscriptions only.
// Every write goes through a server action using the service-role client.
//
// It never refreshes the session itself: it asks /api/auth/token (see
// ./token-route.ts) for the access token, and that request's proxy.ts
// refreshes the session cookies. Only the server writes them, so they keep
// their long lifetime — Safari caps cookies written from JavaScript at 7
// days, which signed people out after a week away — and a browser refresh
// can't race the server's over the same one-time refresh token.

let client: SupabaseClient | undefined;
let cached: { token: string | null; until: number } | undefined;
let inFlight: Promise<string | null> | undefined;

/** Seconds since the epoch at which this JWT expires. */
function expiresAt(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp : 0;
  } catch {
    return 0;
  }
}

async function accessToken(): Promise<string | null> {
  if (cached && Date.now() < cached.until) return cached.token;
  inFlight ??= fetch("/api/auth/token", { cache: "no-store", credentials: "same-origin" })
    .then((res) => (res.ok ? res.json() : { token: null }))
    .then(({ token }: { token: string | null }) => {
      // A minute before it expires; signed out, ask again in a minute.
      cached = { token, until: token ? (expiresAt(token) - 60) * 1000 : Date.now() + 60_000 };
      return token;
    })
    .catch(() => cached?.token ?? null)
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}

export function createClient() {
  client ??= createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    accessToken,
  });
  return client;
}
