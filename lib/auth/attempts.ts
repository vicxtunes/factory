import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Failed-attempt throttle for the one-time PIN link and client phone
// claiming. Sign-in itself is Google's problem now, but linking a Google
// account to an existing worker/designer/client is still a guessable secret
// (a 4–8 digit PIN, a phone number), and Google accounts are free to create,
// so both the target ("worker:<id>") and the Google user ("user:<id>") are
// counted. Not atomic — a burst of parallel requests can slip a few extra
// guesses past the limit, which is fine against a 15-minute window.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

export const TOO_MANY_ATTEMPTS = "Too many attempts. Please wait 15 minutes and try again.";

export async function isBlocked(keys: string[]): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("auth_attempts").select("key, failures, window_start").in("key", keys);
  const now = Date.now();
  return (data ?? []).some(
    (r) => r.failures >= MAX_FAILURES && now - new Date(r.window_start).getTime() < WINDOW_MS,
  );
}

export async function recordFailure(keys: string[]): Promise<void> {
  const admin = createAdminClient();
  const now = Date.now();
  const { data } = await admin.from("auth_attempts").select("key, failures, window_start").in("key", keys);
  const existing = new Map((data ?? []).map((r) => [r.key, r]));
  await admin.from("auth_attempts").upsert(
    keys.map((key) => {
      const row = existing.get(key);
      const fresh = !row || now - new Date(row.window_start).getTime() >= WINDOW_MS;
      return {
        key,
        failures: fresh ? 1 : row.failures + 1,
        window_start: fresh ? new Date(now).toISOString() : row.window_start,
      };
    }),
  );
}

export async function clearAttempts(keys: string[]): Promise<void> {
  const admin = createAdminClient();
  await admin.from("auth_attempts").delete().in("key", keys);
}
