import "server-only";

// This app's TeamStore: the team_members table
// (supabase/migrations/20261003170000_team_tasks.sql). Service-role client,
// so every query here filters by the scope's tenant.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { TeamMember, TeamMemberInput } from "../../core/model";
import type { TeamStore } from "../../ports";

interface Row {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  archived_at: string | null;
}

const COLUMNS = "id, name, phone, role, archived_at";
const toMember = (r: Row): TeamMember => ({ id: r.id, name: r.name, phone: r.phone, role: r.role, archivedAt: r.archived_at });
/** The writable columns, named one by one. */
const toColumns = (m: TeamMemberInput) => ({ name: m.name, phone: m.phone, role: m.role });

function fail(what: string, error: { message: string }): never {
  throw new Error(`team: could not ${what}: ${error.message}`);
}

const table = () => createAdminClient().from("team_members");

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

  async update(scope, id, input) {
    const { data, error } = await table().update(toColumns(input)).eq("tenant_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("save the team member", error);
    return data.length === 1;
  },

  async setArchived(scope, id, archived) {
    const { data, error } = await table()
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .select("id");
    if (error) fail("archive the team member", error);
    return data.length === 1;
  },
};
