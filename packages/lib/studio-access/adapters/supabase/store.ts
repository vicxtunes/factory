import "server-only";

// This app's AccessStore: a studio's access columns on `tenants` and its
// pending email codes (supabase/migrations/20261004120000_studio_access.sql).
// Service-role client; only studios (tenants with an owner) are read or written.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { EmailCode, StudioAccess, StudioForReview, StudioStatus } from "../../core";
import type { AccessStore } from "../../ports";

interface Row {
  id: string;
  owner_client_id: string;
  status: StudioStatus;
  name: string;
  phone: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  logo_key: string | null;
  owner_email: string | null;
  owner_email_verified_at: string | null;
  password_hash: string | null;
  password_set_at: string | null;
  password_failed_attempts: number;
  password_locked_until: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  slugs: { slug: string; is_current: boolean }[];
  owner: { name: string; phone: string | null } | null;
}

const COLUMNS =
  "id, owner_client_id, status, name, phone, owner_first_name, owner_last_name, logo_key, owner_email, owner_email_verified_at, " +
  "password_hash, password_set_at, password_failed_attempts, password_locked_until, submitted_at, reviewed_at, review_note, created_at, " +
  "slugs:studio_slugs (slug, is_current), owner:clients (name, phone)";

const toAccess = (r: Row): StudioAccess => ({
  tenantId: r.id,
  ownerClientId: r.owner_client_id,
  client: { name: r.owner?.name ?? "", phone: r.owner?.phone ?? null },
  status: r.status,
  name: r.name,
  phone: r.phone,
  ownerFirstName: r.owner_first_name,
  ownerLastName: r.owner_last_name,
  logoKey: r.logo_key,
  ownerEmail: r.owner_email,
  ownerEmailVerifiedAt: r.owner_email_verified_at,
  slug: r.slugs.find((s) => s.is_current)?.slug ?? null,
  passwordHash: r.password_hash,
  passwordSetAt: r.password_set_at,
  passwordFailedAttempts: r.password_failed_attempts,
  passwordLockedUntil: r.password_locked_until,
  submittedAt: r.submitted_at,
  reviewedAt: r.reviewed_at,
  reviewNote: r.review_note,
  createdAt: r.created_at,
});

const toReview = (r: Row): Omit<StudioForReview, "logoUrl"> => {
  const a = toAccess(r);
  return {
    tenantId: a.tenantId,
    status: a.status,
    name: a.name,
    phone: a.phone,
    ownerName: [a.ownerFirstName, a.ownerLastName].filter(Boolean).join(" "),
    clientName: a.client.name,
    ownerEmail: a.ownerEmailVerifiedAt ? a.ownerEmail : null,
    slug: a.slug,
    submittedAt: a.submittedAt,
    reviewedAt: a.reviewedAt,
    reviewNote: a.reviewNote,
    createdAt: a.createdAt,
  };
};

function fail(what: string, error: { message: string }): never {
  throw new Error(`studio-access: could not ${what}: ${error.message}`);
}

const tenants = () => createAdminClient().from("tenants");
const codes = () => createAdminClient().from("studio_email_codes");

/** Writes to one studio (never Aming's own tenant). */
async function update(tenantId: string, what: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await tenants().update(values).eq("id", tenantId).not("owner_client_id", "is", null);
  if (error) fail(what, error);
}

export const supabaseAccessStore: AccessStore = {
  async get(tenantId) {
    const { data, error } = await tenants().select(COLUMNS).eq("id", tenantId).not("owner_client_id", "is", null).maybeSingle<Row>();
    if (error) fail("load the studio", error);
    return data ? toAccess(data) : null;
  },

  // Named column by column (see packages/lib/README.md → Security).
  saveDetails: (tenantId, d) =>
    update(tenantId, "save the details", { name: d.name, phone: d.phone, owner_first_name: d.ownerFirstName, owner_last_name: d.ownerLastName }),

  async setLogo(tenantId, key) {
    const { data, error } = await tenants().select("logo_key").eq("id", tenantId).single<{ logo_key: string | null }>();
    if (error) fail("load the logo", error);
    await update(tenantId, "save the logo", { logo_key: key });
    return data.logo_key;
  },

  setOwnerEmail: (tenantId, email, at) => update(tenantId, "save the email", { owner_email: email, owner_email_verified_at: at }),

  setPassword: (tenantId, hash, at) =>
    update(tenantId, "save the password", { password_hash: hash, password_set_at: at, password_failed_attempts: 0, password_locked_until: null }),

  recordWrongPassword: (tenantId, attempts, lockedUntil) =>
    update(tenantId, "record a wrong password", { password_failed_attempts: attempts, password_locked_until: lockedUntil }),

  clearWrongPasswords: (tenantId) => update(tenantId, "clear wrong passwords", { password_failed_attempts: 0, password_locked_until: null }),

  async setStatus(tenantId, from, to, at, note) {
    const { data, error } = await tenants()
      .update({ status: to, review_note: note, ...(to === "in_review" ? { submitted_at: at } : { reviewed_at: at }) })
      .eq("id", tenantId)
      .eq("status", from)
      .not("owner_client_id", "is", null)
      .select("id");
    if (error) fail("change the studio's status", error);
    return data.length === 1;
  },

  async forReview() {
    const { data, error } = await tenants()
      .select(COLUMNS)
      .not("owner_client_id", "is", null)
      .order("submitted_at", { ascending: true, nullsFirst: false })
      .returns<Row[]>();
    if (error) fail("list studios", error);
    const order: Record<StudioStatus, number> = { in_review: 0, changes_requested: 1, onboarding: 2, active: 3, suspended: 4 };
    return data.map(toReview).sort((a, b) => order[a.status] - order[b.status]);
  },

  async reviewOne(tenantId) {
    const { data, error } = await tenants().select(COLUMNS).eq("id", tenantId).not("owner_client_id", "is", null).maybeSingle<Row>();
    if (error) fail("load the studio", error);
    return data ? toReview(data) : null;
  },

  async code(tenantId, purpose) {
    const { data, error } = await codes()
      .select("tenant_id, purpose, email, code_hash, attempts, sent_at, expires_at")
      .eq("tenant_id", tenantId)
      .eq("purpose", purpose)
      .maybeSingle();
    if (error) fail("load the code", error);
    return data
      ? {
          tenantId: data.tenant_id,
          purpose: data.purpose as EmailCode["purpose"],
          email: data.email,
          codeHash: data.code_hash,
          attempts: data.attempts,
          sentAt: data.sent_at,
          expiresAt: data.expires_at,
        }
      : null;
  },

  async saveCode(c) {
    const { error } = await codes().upsert({
      tenant_id: c.tenantId,
      purpose: c.purpose,
      email: c.email,
      code_hash: c.codeHash,
      attempts: c.attempts,
      sent_at: c.sentAt,
      expires_at: c.expiresAt,
    });
    if (error) fail("save the code", error);
  },

  async setCodeAttempts(tenantId, purpose, attempts) {
    const { error } = await codes().update({ attempts }).eq("tenant_id", tenantId).eq("purpose", purpose);
    if (error) fail("count a wrong code", error);
  },

  async deleteCode(tenantId, purpose) {
    const { error } = await codes().delete().eq("tenant_id", tenantId).eq("purpose", purpose);
    if (error) fail("use up the code", error);
  },
};
