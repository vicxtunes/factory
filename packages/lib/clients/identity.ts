import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fullName, type Identity } from "./core/identity";

/**
 * Records a client's confirmed real name; their display name becomes
 * "First Last". The identity must already be parsed by identitySchema.
 */
export async function saveClientIdentity(admin: SupabaseClient, clientId: string, identity: Identity): Promise<void> {
  const { error } = await admin
    .from("clients")
    .update({
      first_name: identity.firstName,
      last_name: identity.lastName,
      name: fullName(identity),
      identity_confirmed_at: new Date().toISOString(),
    })
    .eq("id", clientId);
  if (error) throw new Error(`saveClientIdentity: ${error.message}`);
}
