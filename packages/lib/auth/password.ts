import "server-only";

import { createClient as createStatelessClient } from "@supabase/supabase-js";

import { createAdminClient } from "@repo/lib/supabase/admin";

/**
 * Whether the password is right for this email. Checked with a throwaway,
 * cookie-less client; the session Supabase makes is revoked at once (that one
 * only: the default scope would sign them out on every other device) — the
 * real one comes only after the emailed code.
 */
export async function passwordMatches(email: string, password: string): Promise<boolean> {
  const supabase = createStatelessClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  await createAdminClient().auth.admin.signOut(data.session.access_token, "local");
  return true;
}
