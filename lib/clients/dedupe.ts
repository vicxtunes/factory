import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ClientMatchReason } from "./match";

// Client de-duplication helper. One matcher (`find_client_candidates`, see
// supabase/migrations/20260910120000_client_dedupe.sql) sits behind every
// path that can create a client: the /dashboard/clients add + edit forms, the
// new-order "new customer" branch, and CSV bulk import.

export { matchReasonLabel, type ClientMatchReason } from "./match";

export interface ClientCandidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  match_reason: ClientMatchReason;
  score: number;
}

export interface ClientIdentityInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

// Rank existing clients against an incoming (name, email, phone). Exact
// phone/email hits come back first (score 1), then exact name (0.95), then
// fuzzy name matches by trigram similarity.
export async function findClientCandidates(
  admin: SupabaseClient,
  input: ClientIdentityInput & { excludeId?: string | null; limit?: number },
): Promise<ClientCandidate[]> {
  const { data, error } = await admin.rpc("find_client_candidates", {
    p_name: input.name?.trim() || null,
    p_email: input.email?.trim() || null,
    p_phone: input.phone?.trim() || null,
    p_exclude_id: input.excludeId ?? null,
    p_limit: input.limit ?? 10,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientCandidate[];
}

// An exact phone or email match means "this is the same client" — reuse the
// row rather than inserting. Name-only matches are advisory: they're surfaced
// to the user but never block or auto-merge.
export function exactClientMatch(candidates: ClientCandidate[]): ClientCandidate | null {
  return (
    candidates.find((c) => c.match_reason === "phone") ??
    candidates.find((c) => c.match_reason === "email") ??
    null
  );
}

export interface ResolvedClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  reused: boolean;
  reusedReason?: ClientMatchReason;
}

// Resolve an incoming client to an existing row when it clearly matches one
// (exact phone/email), otherwise insert. Race-safe: a concurrent insert that
// trips the phone/email unique index falls back to a re-lookup. Used by the
// new-order flow and CSV bulk import.
export async function resolveOrCreateClient(
  admin: SupabaseClient,
  input: ClientIdentityInput,
): Promise<{ ok: true; client: ResolvedClient } | { ok: false; error: string }> {
  const name = input.name?.trim() ?? "";
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;
  if (!name) return { ok: false, error: "Client name is required." };

  const reuse = (c: ClientCandidate): { ok: true; client: ResolvedClient } => ({
    ok: true,
    client: {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      reused: true,
      reusedReason: c.match_reason,
    },
  });

  const existing = exactClientMatch(await findClientCandidates(admin, { name, email, phone }));
  if (existing) return reuse(existing);

  const insert = await admin
    .from("clients")
    .insert({ name, email, phone })
    .select("id, name, email, phone")
    .single();

  if (insert.error) {
    // 23505 = a concurrent insert claimed this phone/email between our check
    // and now. Re-read and use that row.
    if ((insert.error as { code?: string }).code === "23505") {
      const raced = exactClientMatch(await findClientCandidates(admin, { name, email, phone }));
      if (raced) return reuse(raced);
    }
    return { ok: false, error: insert.error.message };
  }

  return {
    ok: true,
    client: {
      id: insert.data.id,
      name: insert.data.name,
      email: insert.data.email,
      phone: insert.data.phone,
      reused: false,
    },
  };
}
