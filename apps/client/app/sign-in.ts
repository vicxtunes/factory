import "server-only";

import { createAdminClient } from "@repo/lib/supabase/admin";
import { createClient } from "@repo/lib/supabase/server";

import { rememberDevice, type RememberedClient } from "./remembered-device";

// Opening a session for a client, once something has proved it's them. Kept
// out of the "use server" files: everything those export can be called from
// the browser, and these sign in as whoever they're given.

type Admin = ReturnType<typeof createAdminClient>;

/** Signs this browser in as the auth user with this email (Supabase sends nothing). Returns its id. */
export async function openSession(email: string): Promise<string | null> {
  const { data: link, error: linkError } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (linkError) {
    console.error("client login: generateLink failed:", linkError);
    return null;
  }
  const { data, error } = await (await createClient()).auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (error || !data.user) {
    console.error("client login: verifyOtp failed:", error);
    return null;
  }
  return data.user.id;
}

/** One auth user per client: a new email for the client (changed by reception) replaces the old link. */
export async function linkClient(admin: Admin, clientId: string, authUserId: string): Promise<boolean> {
  await admin.from("client_identities").delete().eq("client_id", clientId).neq("auth_user_id", authUserId);
  const { error } = await admin
    .from("client_identities")
    .upsert({ auth_user_id: authUserId, client_id: clientId }, { onConflict: "auth_user_id" });
  if (error) console.error("client login: linking identity failed:", error);
  return !error;
}

/** Signs this browser in to the account it remembers (the lock screen, any way it was unlocked). */
export async function signInRemembered(client: RememberedClient): Promise<boolean> {
  const authUserId = await openSession(client.email);
  if (!authUserId || !(await linkClient(createAdminClient(), client.clientId, authUserId))) {
    await (await createClient()).auth.signOut({ scope: "local" });
    return false;
  }
  await rememberDevice(client.clientId);
  return true;
}
