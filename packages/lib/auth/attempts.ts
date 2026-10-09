import "server-only";

import { createAdminClient } from "@repo/lib/supabase/admin";

// A counter per key in a 15-minute window, on the auth_attempts table (RLS
// on, no policies: service role only). Client sign-in uses it to cap codes
// sent per email ("login-send:<email>") and wrong guesses per code
// ("login-code:<nonce>"). Not atomic — a burst of parallel requests can slip
// a few past the limit, which is fine against a 15-minute window.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type Row = { key: string; failures: number; window_start: string };

async function current(key: string): Promise<Row | null> {
  const { data } = await createAdminClient()
    .from("auth_attempts")
    .select("key, failures, window_start")
    .eq("key", key)
    .maybeSingle<Row>();
  if (!data || Date.now() - Date.parse(data.window_start) >= WINDOW_MS) return null;
  return data;
}

export async function tooManyAttempts(key: string): Promise<boolean> {
  return ((await current(key))?.failures ?? 0) >= MAX_ATTEMPTS;
}

/** Counts one attempt. Returns true once this one reaches the limit. */
export async function countAttempt(key: string): Promise<boolean> {
  const row = await current(key);
  const failures = (row?.failures ?? 0) + 1;
  await createAdminClient()
    .from("auth_attempts")
    .upsert({ key, failures, window_start: row?.window_start ?? new Date().toISOString() });
  return failures >= MAX_ATTEMPTS;
}
