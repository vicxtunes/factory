import "server-only";

// This app's TaskStore: the tasks table
// (supabase/migrations/20261003170000_team_tasks.sql). Service-role client,
// so every query here filters by the scope's tenant; composite keys also make
// the database refuse another studio's project or team member.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Task, TaskInput, TaskPriority, TaskStatus } from "../../core/model";
import { TaskError, type TaskStore } from "../../ports";

interface Row {
  id: string;
  project_id: string;
  title: string;
  assignee_id: string | null;
  due_on: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  done_at: string | null;
  project: { title: string } | null;
  assignee: { name: string } | null;
}

const COLUMNS = `id, project_id, title, assignee_id, due_on, priority, status, done_at,
  project:projects!tasks_tenant_id_project_id_fkey (title),
  assignee:team_members!tasks_tenant_id_assignee_id_fkey (name)`;

const toTask = (r: Row): Task => ({
  id: r.id,
  projectId: r.project_id,
  projectTitle: r.project?.title ?? "",
  title: r.title,
  assigneeId: r.assignee_id,
  assigneeName: r.assignee?.name ?? null,
  dueOn: r.due_on,
  priority: r.priority,
  status: r.status,
  doneAt: r.done_at,
});

/** The writable columns, named one by one. */
const toColumns = (t: Omit<TaskInput, "projectId">) => ({ title: t.title, assignee_id: t.assigneeId, due_on: t.dueOn, priority: t.priority });

function fail(what: string, error: { code?: string; message: string }): never {
  // A project or team member from another studio: the composite keys caught it.
  if (error.code === "23503") throw new TaskError("That project or team member doesn't belong to your studio.");
  throw new Error(`tasks: could not ${what}: ${error.message}`);
}

const table = () => createAdminClient().from("tasks");

export const supabaseTaskStore: TaskStore = {
  async list(scope, filter) {
    let query = table().select(COLUMNS).eq("tenant_id", scope.tenantId);
    if (filter.projectId) query = query.eq("project_id", filter.projectId);
    if (filter.assigneeId) query = query.eq("assignee_id", filter.assigneeId);
    if (filter.open) query = query.neq("status", "done");
    const { data, error } = await query.returns<Row[]>();
    if (error) fail("list tasks", error);
    return data.map(toTask);
  },

  async get(scope, id) {
    const { data, error } = await table().select(COLUMNS).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<Row>();
    if (error) fail("load the task", error);
    return data ? toTask(data) : null;
  },

  async create(scope, input) {
    const { data, error } = await table()
      .insert({ ...toColumns(input), project_id: input.projectId, tenant_id: scope.tenantId })
      .select("id")
      .single<{ id: string }>();
    if (error) fail("add the task", error);
    return data.id;
  },

  async update(scope, id, input) {
    const { data, error } = await table().update(toColumns(input)).eq("tenant_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("save the task", error);
    return data.length === 1;
  },

  async setStatus(scope, id, status) {
    const { data, error } = await table()
      .update({ status, done_at: status === "done" ? new Date().toISOString() : null })
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .select("id");
    if (error) fail("change the task", error);
    return data.length === 1;
  },

  async remove(scope, id) {
    const { data, error } = await table().delete().eq("tenant_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("remove the task", error);
    return data.length === 1;
  },
};
