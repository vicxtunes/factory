import "server-only";

// This app's TeamStore and TeamAccounts: the team_members table
// (supabase/migrations/20261003170000_team_tasks.sql, 20261013100000_team_access.sql),
// and studios' owners. Service-role client, so every
// scoped query here filters by the scope's tenant; the invite and account
// lookups match the exact token or account.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Area } from "../../core/access";
import type { Membership, TeamMember, TeamMemberInput } from "../../core/model";
import { TeamError, type TeamAccounts, type TeamStore } from "../../ports";

interface Row {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  role: string | null;
  archived_at: string | null;
  client_id: string | null;
  access: Area[];
  invite_token: string | null;
  invite_expires_at: string | null;
}

const COLUMNS = "id, tenant_id, name, phone, role, archived_at, client_id, access, invite_token, invite_expires_at";
const toMember = (r: Row): TeamMember => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  role: r.role,
  archivedAt: r.archived_at,
  joined: r.client_id !== null,
  access: r.access,
  invite: r.invite_token && r.invite_expires_at ? { token: r.invite_token, expiresAt: r.invite_expires_at } : null,
});
/** The writable columns, named one by one. */
const toColumns = (m: TeamMemberInput) => ({ name: m.name, phone: m.phone, role: m.role });

function fail(what: string, error: { code?: string; message: string }): never {
  // One account per studio's team: the unique index caught a second.
  if (error.code === "23505" && error.message.includes("one_account")) throw new TeamError("This account is already on this business's team.");
  throw new Error(`team: could not ${what}: ${error.message}`);
}

const table = () => createAdminClient().from("team_members");

/** Changes one member of the scope's studio; false when there's no such member there. */
async function change(tenantId: string, id: string, columns: Record<string, unknown>, what: string): Promise<boolean> {
  const { data, error } = await table().update(columns).eq("tenant_id", tenantId).eq("id", id).select("id");
  if (error) fail(what, error);
  return data.length === 1;
}

export const supabaseTeamStore: TeamStore = {
  async list(scope) {
    const { data, error } = await table().select(COLUMNS).eq("tenant_id", scope.tenantId).returns<Row[]>();
    if (error) fail("list the team", error);
    return data.map(toMember);
  },

  async get(scope, id) {
    const { data, error } = await table().select(COLUMNS).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<Row>();
    if (error) fail("load the team member", error);
    return data ? toMember(data) : null;
  },

  async create(scope, input) {
    const { data, error } = await table()
      .insert({ ...toColumns(input), tenant_id: scope.tenantId })
      .select("id")
      .single<{ id: string }>();
    if (error) fail("add the team member", error);
    return data.id;
  },

  update: (scope, id, input) => change(scope.tenantId, id, toColumns(input), "save the team member"),

  setArchived: (scope, id, archived) => change(scope.tenantId, id, { archived_at: archived ? new Date().toISOString() : null }, "archive the team member"),

  setAccess: (scope, id, access) => change(scope.tenantId, id, { access }, "save their access"),

  setInvite: (scope, id, invite) =>
    change(scope.tenantId, id, { invite_token: invite?.token ?? null, invite_expires_at: invite?.expiresAt ?? null }, "make the invite link"),

  removeAccount: (scope, id) => change(scope.tenantId, id, { client_id: null, invite_token: null, invite_expires_at: null }, "remove their access"),

  async byInvite(token) {
    const { data, error } = await table().select(COLUMNS).eq("invite_token", token).maybeSingle<Row>();
    if (error) fail("load the invite", error);
    return data ? { tenantId: data.tenant_id, member: toMember(data) } : null;
  },

  async join(tenantId, memberId, token, clientId) {
    const { data, error } = await table()
      .update({ client_id: clientId, invite_token: null, invite_expires_at: null })
      .eq("tenant_id", tenantId)
      .eq("id", memberId)
      .eq("invite_token", token)
      .is("archived_at", null)
      .select("id");
    if (error) fail("join the team", error);
    return data.length === 1;
  },

  async membershipsOf(clientId) {
    const { data, error } = await table()
      .select("id, tenant_id, access, tenant:tenants!team_members_tenant_id_fkey (name)")
      .eq("client_id", clientId)
      .is("archived_at", null)
      .returns<{ id: string; tenant_id: string; access: Area[]; tenant: { name: string } | null }[]>();
    if (error) fail("list the studios they work for", error);
    return data.map((r): Membership => ({ tenantId: r.tenant_id, memberId: r.id, name: r.tenant?.name ?? "", access: r.access }));
  },
};

export const supabaseTeamAccounts: TeamAccounts = {
  async ownerOf(tenantId) {
    const { data, error } = await createAdminClient().from("tenants").select("owner_client_id").eq("id", tenantId).maybeSingle<{ owner_client_id: string | null }>();
    if (error) fail("look up the business's owner", error);
    return data?.owner_client_id ?? null;
  },
};
