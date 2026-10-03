import "server-only";

// This app's TaskDirectory: projects and team members (their modules' tables), read for one tenant.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { TaskDirectory } from "../../ports";

export const supabaseTaskDirectory: TaskDirectory = {
  async project(scope, id) {
    const { data, error } = await createAdminClient()
      .from("projects")
      .select("status")
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .maybeSingle<{ status: string }>();
    if (error) throw new Error(`tasks: could not load the project: ${error.message}`);
    return data ? { completed: data.status === "completed" } : null;
  },

  async member(scope, id) {
    const { data, error } = await createAdminClient()
      .from("team_members")
      .select("archived_at")
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .maybeSingle<{ archived_at: string | null }>();
    if (error) throw new Error(`tasks: could not load the team member: ${error.message}`);
    return data ? { archived: data.archived_at !== null } : null;
  },
};
