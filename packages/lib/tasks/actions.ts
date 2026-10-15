"use server";

// The browser's only entry point to tasks. The tenant always comes from the
// caller's studio (packages/lib/studios), never from the browser; an id from
// another studio is simply "not found".
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { notifyActor } from "@repo/lib/push/send";
import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";
import { studioOfCaller } from "@repo/lib/studios/server";
import { canUse } from "@repo/lib/team/core";

import { files } from "@repo/lib/files/server";
import { team } from "@repo/lib/team/server";

import { taskIdSchema, taskInputSchema, taskStatusSchema, type TaskInput } from "./core";
import { tasks } from "./server";

/**
 * Whoever a task in a folder is given to can open the folder: the client as
 * a viewer without downloads (proofs to choose from or comment on), a team
 * member without the Files area as an editor. A share they already have
 * stays as it is.
 */
async function openFolderFor(scope: TenantScope, task: Pick<TaskInput, "folderId" | "customerId" | "assigneeId">): Promise<void> {
  if (!task.folderId) return;
  if (task.customerId) return files.ensureShared(scope, task.folderId, { kind: "client", customerId: task.customerId }, "viewer", false);
  if (!task.assigneeId) return;
  const member = await team.get(scope, task.assigneeId);
  if (member && !member.access.includes("files")) await files.ensureShared(scope, task.folderId, { kind: "member", memberId: member.id }, "editor");
}

/**
 * The team member a task was just given to hears about it, on the account
 * they joined with (one who hasn't joined has nowhere to hear it). Best
 * effort: the task stands either way.
 */
async function tellAssignee(scope: TenantScope, assigneeId: string | null, title: string, studioName: string): Promise<void> {
  if (!assigneeId) return;
  try {
    const { data } = await createAdminClient()
      .from("team_members")
      .select("client_id")
      .eq("tenant_id", scope.tenantId)
      .eq("id", assigneeId)
      .maybeSingle<{ client_id: string | null }>();
    if (data?.client_id) await notifyActor({ type: "client", id: data.client_id }, { title: `New task from ${studioName}`, body: title, url: "/studio/tasks" });
  } catch (err) {
    console.error("tasks: telling the assignee failed:", err);
  }
}

/** Who a task is given to now (before an edit changes it). */
async function assigneeOf(scope: TenantScope, taskId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("tasks").select("assignee_id").eq("tenant_id", scope.tenantId).eq("id", taskId).maybeSingle<{ assignee_id: string | null }>();
  return data?.assignee_id ?? null;
}

export async function createTask(input: unknown): Promise<Result<string>> {
  return runAction("tasks", async () => {
    const { scope, studio } = await studioOfCaller("projects");
    const task = parseInput(taskInputSchema, input);
    const id = await tasks.create(scope, task);
    await openFolderFor(scope, task);
    await tellAssignee(scope, task.assigneeId, task.title, studio.name);
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function updateTask(id: unknown, input: unknown): Promise<Result> {
  return runAction("tasks", async () => {
    const { scope, studio } = await studioOfCaller("projects");
    const taskId = parseInput(taskIdSchema, id);
    const task = parseInput(taskInputSchema, input);
    const before = await assigneeOf(scope, taskId);
    await tasks.update(scope, taskId, task);
    await openFolderFor(scope, { ...task, folderId: (await tasks.get(scope, taskId))?.folderId ?? null });
    // Told only when it's given to someone new.
    if (task.assigneeId !== before) await tellAssignee(scope, task.assigneeId, task.title, studio.name);
    revalidatePath("/studio", "layout");
  });
}

/** Moves a task along: anyone with Projects & tasks, or the team member it's given to. */
export async function setTaskStatus(id: unknown, status: unknown): Promise<Result> {
  return runAction("tasks", async () => {
    const { scope, access } = await studioOfCaller("anyone");
    const onlyFor = access.owner || canUse(access, "projects") ? undefined : access.memberId;
    await tasks.setStatus(scope, parseInput(taskIdSchema, id), parseInput(taskStatusSchema, status), onlyFor);
    revalidatePath("/studio", "layout");
  });
}

export async function removeTask(id: unknown): Promise<Result> {
  return runAction("tasks", async () => {
    const { scope } = await studioOfCaller("projects");
    await tasks.remove(scope, parseInput(taskIdSchema, id));
    revalidatePath("/studio", "layout");
  });
}
