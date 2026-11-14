import "server-only";

// This app's TeamStore and TeamAccounts: the team_members table
// (supabase/migrations/20261003170000_team_tasks.sql, 20261013100000_team_access.sql,
// 20270107100000_team_access_levels.sql) and team_access_roles,
// and studios' owners. Service-role client, so every
// scoped query here filters by the scope's tenant; the invite and account
// lookups match the exact token or account.

import { createAdminClient } from "@repo/lib/supabase/admin";

import { cleanAreas, resolveAreas, type AccessRole } from "../../core/access";
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
  access_role_id: string | null;
  access_levels: unknown;
  invite_token: string | null;
  invite_expires_at: string | null;
}

const COLUMNS = "id, tenant_id, name, phone, role, archived_at, client_id, access_role_id, access_levels, invite_token, invite_expires_at";
/** A member as stored, with their areas resolved against their business's roles. */
const toMember = (r: Row, roles: Map<string, unknown>): TeamMember => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  role: r.role,
  archivedAt: r.archived_at,
  joined: r.client_id !== null,
  accountId: r.client_id,
  accessRoleId: r.access_role_id,
  ownAccess: cleanAreas(r.access_levels),
  access: resolveAreas(r.access_role_id ? roles.get(r.access_role_id) : null, r.access_levels),
  invite: r.invite_token && r.invite_expires_at ? { token: r.invite_token, expiresAt: r.invite_expires_at } : null,
});
/** The writable columns, named one by one. */
const toColumns = (m: TeamMemberInput) => ({ name: m.name, phone: m.phone, role: m.role });

function fail(what: string, error: { code?: string; message: string }): never {
  // One account per studio's team: the unique index caught a second.
  if (error.code === "23505" && error.message.includes("one_account")) throw new TeamError("This account is already on this business's team.");
  if (error.code === "23505" && error.message.includes("team_access_roles_name")) throw new TeamError("There's already a role with that name.");
  // A role someone is on (team_members_access_role).
  if (error.code === "23503") throw new TeamError("Someone on the team has this role. Give them another role first.");
  throw new Error(`team: could not ${what}: ${error.message}`);
}

const table = () => createAdminClient().from("team_members");
const rolesTable = () => createAdminClient().from("team_access_roles");

/** Each role's areas, by id, for these businesses. */
async function roleAccess(tenantIds: string[]): Promise<Map<string, unknown>> {
  if (!tenantIds.length) return new Map();
  const { data, error } = await rolesTable().select("id, access").in("tenant_id", [...new Set(tenantIds)]).returns<{ id: string; access: unknown }[]>();
  if (error) fail("load the roles", error);
  return new Map(data.map((r) => [r.id, r.access]));
}

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
    const roles = await roleAccess([scope.tenantId]);
    return data.map((r) => toMember(r, roles));
  },

  async get(scope, id) {
    const { data, error } = await table().select(COLUMNS).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<Row>();
    if (error) fail("load the team member", error);
    return data ? toMember(data, await roleAccess([scope.tenantId])) : null;
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

  setAccess: (scope, id, roleId, own) => change(scope.tenantId, id, { access_role_id: roleId, access_levels: own }, "save their access"),

  async roles(scope) {
    const { data, error } = await rolesTable()
      .select("id, name, access")
      .eq("tenant_id", scope.tenantId)
      .order("created_at")
      .returns<{ id: string; name: string; access: unknown }[]>();
    if (error) fail("load the roles", error);
    return data.map((r): AccessRole => ({ id: r.id, name: r.name, access: cleanAreas(r.access) }));
  },

  async addRoles(scope, roles) {
    const { error } = await rolesTable().insert(roles.map((r) => ({ tenant_id: scope.tenantId, name: r.name, access: r.access })));
    if (error) fail("add the role", error);
  },

  async updateRole(scope, id, role) {
    const { data, error } = await rolesTable()
      .update({ name: role.name, access: role.access, updated_at: new Date().toISOString() })
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .select("id");
    if (error) fail("save the role", error);
    return data.length === 1;
  },

  async deleteRole(scope, id) {
    const { data, error } = await rolesTable().delete().eq("tenant_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("delete the role", error);
    return data.length === 1;
  },

  setInvite: (scope, id, invite) =>
    change(scope.tenantId, id, { invite_token: invite?.token ?? null, invite_expires_at: invite?.expiresAt ?? null }, "make the invite link"),

  removeAccount: (scope, id) => change(scope.tenantId, id, { client_id: null, invite_token: null, invite_expires_at: null }, "remove their access"),

  async byInvite(token) {
    const { data, error } = await table().select(COLUMNS).eq("invite_token", token).maybeSingle<Row>();
    if (error) fail("load the invite", error);
    return data ? { tenantId: data.tenant_id, member: toMember(data, await roleAccess([data.tenant_id])) } : null;
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
      .select("id, tenant_id, access_role_id, access_levels, tenant:tenants!team_members_tenant_id_fkey (name)")
      .eq("client_id", clientId)
      .is("archived_at", null)
      .returns<{ id: string; tenant_id: string; access_role_id: string | null; access_levels: unknown; tenant: { name: string } | null }[]>();
    if (error) fail("list the studios they work for", error);
    const roles = await roleAccess(data.map((r) => r.tenant_id));
    return data.map(
      (r): Membership => ({
        tenantId: r.tenant_id,
        memberId: r.id,
        name: r.tenant?.name ?? "",
        access: resolveAreas(r.access_role_id ? roles.get(r.access_role_id) : null, r.access_levels),
      }),
    );
  },
};

export const supabaseTeamAccounts: TeamAccounts = {
  async ownerOf(tenantId) {
    const { data, error } = await createAdminClient().from("tenants").select("owner_client_id").eq("id", tenantId).maybeSingle<{ owner_client_id: string | null }>();
    if (error) fail("look up the business's owner", error);
    return data?.owner_client_id ?? null;
  },
};
