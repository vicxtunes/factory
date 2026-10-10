import "server-only";

// This app's PortalStore: studio_slugs, studio_set_slug() and the portal
// columns on customers (supabase/migrations/20261003190000_studio_portal.sql).
// Service-role client; every client query is within one tenant.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { SignInRecord } from "../../core/model";
import { PortalError, type PortalStore } from "../../ports";

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  portal_access_at: string | null;
}

const CUSTOMER = "id, name, phone, portal_access_at";

const toRecord = (r: CustomerRow): SignInRecord => ({
  customerId: r.id,
  name: r.name,
  phone: r.phone,
  accessAt: r.portal_access_at,
});

function fail(what: string, error: { message: string }): never {
  if (error.message.includes("STUDIO_SLUG:taken")) throw new PortalError("That address is taken. Try another.");
  throw new Error(`studio-portal: could not ${what}: ${error.message}`);
}

const customers = () => createAdminClient().from("customers");

async function update(tenantId: string, customerId: string, values: Record<string, unknown>, what: string) {
  const { data, error } = await customers().update(values).eq("tenant_id", tenantId).eq("id", customerId).select("id");
  if (error) fail(what, error);
  return data.length === 1;
}

export const supabasePortalStore: PortalStore = {
  async studioBySlug(slug) {
    const db = createAdminClient();
    const { data, error } = await db.from("studio_slugs").select("tenant_id").eq("slug", slug).maybeSingle<{ tenant_id: string }>();
    if (error) fail("look up the address", error);
    if (!data) return null;
    const current = await supabasePortalStore.currentSlug(data.tenant_id);
    return current ? { tenantId: data.tenant_id, currentSlug: current } : null;
  },

  async currentSlug(tenantId) {
    const { data, error } = await createAdminClient()
      .from("studio_slugs")
      .select("slug")
      .eq("tenant_id", tenantId)
      .eq("is_current", true)
      .maybeSingle<{ slug: string }>();
    if (error) fail("look up the address", error);
    return data?.slug ?? null;
  },

  async setSlug(tenantId, slug) {
    const { error } = await createAdminClient().rpc("studio_set_slug", { p_tenant: tenantId, p_slug: slug });
    if (error) fail("set the address", error);
  },

  async customerByPhone(tenantId, phone) {
    const { data, error } = await customers().select(CUSTOMER).eq("tenant_id", tenantId).eq("phone", phone).maybeSingle<CustomerRow>();
    if (error) fail("look up the phone number", error);
    return data ? toRecord(data) : null;
  },

  async customer(tenantId, customerId) {
    const { data, error } = await customers().select(CUSTOMER).eq("tenant_id", tenantId).eq("id", customerId).maybeSingle<CustomerRow>();
    if (error) fail("load the client", error);
    return data ? toRecord(data) : null;
  },

  async customerByInvite(inviteDigest) {
    const { data, error } = await customers()
      .select("id, tenant_id, portal_invite_expires_at")
      .eq("portal_invite_hash", inviteDigest)
      .maybeSingle<{ id: string; tenant_id: string; portal_invite_expires_at: string }>();
    if (error) fail("check the link", error);
    return data ? { tenantId: data.tenant_id, customerId: data.id, expiresAt: data.portal_invite_expires_at } : null;
  },

  async setInvite(tenantId, customerId, inviteDigest, expiresAt) {
    return update(tenantId, customerId, { portal_invite_hash: inviteDigest, portal_invite_expires_at: expiresAt }, "make the link");
  },

  async setAccess(tenantId, customerId, at) {
    await update(tenantId, customerId, { portal_access_at: at, portal_invite_hash: null, portal_invite_expires_at: null }, "open the client's page");
  },

  async recordSignIn(tenantId, customerId, at) {
    await update(tenantId, customerId, { portal_signed_in_at: at }, "record the sign-in");
  },

  async status(scope, customerId) {
    const { data, error } = await customers()
      .select("phone, portal_pin_hash, portal_access_at, portal_invite_expires_at, portal_signed_in_at")
      .eq("tenant_id", scope.tenantId)
      .eq("id", customerId)
      .maybeSingle<{
        phone: string | null;
        portal_pin_hash: string | null;
        portal_access_at: string | null;
        portal_invite_expires_at: string | null;
        portal_signed_in_at: string | null;
      }>();
    if (error) fail("load the client's portal", error);
    if (!data) return null;
    return {
      hasPhone: data.phone !== null,
      hasAccess: data.portal_access_at !== null || data.portal_pin_hash !== null,
      inviteExpiresAt: data.portal_invite_expires_at,
      signedInAt: data.portal_signed_in_at,
    };
  },
};
