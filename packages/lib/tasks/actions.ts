"use server";

// The browser's only entry point to tasks. The tenant always comes from the
// caller's studio (packages/lib/studios), never from the browser; an id from
// another studio is simply "not found".
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";
import { canUse } from "@repo/lib/team/core";

import { taskIdSchema, taskInputSchema, taskStatusSchema } from "./core";
import { tasks } from "./server";

export async function createTask(input: unknown): Promise<Result<string>> {
  return runAction("tasks", async () => {
    const { scope } = await studioOfCaller("projects");
    const id = await tasks.create(scope, parseInput(taskInputSchema, input));
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function updateTask(id: unknown, input: unknown): Promise<Result> {
  return runAction("tasks", async () => {
    const { scope } = await studioOfCaller("projects");
    await tasks.update(scope, parseInput(taskIdSchema, id), parseInput(taskInputSchema, input));
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
