"use server";

// The browser's only entry point to tasks. The tenant always comes from the
// caller's studio (packages/lib/studios), never from the browser; an id from
// another studio is simply "not found".
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import { taskIdSchema, taskInputSchema, taskStatusSchema } from "./core";
import { tasks } from "./server";

export async function createTask(input: unknown): Promise<Result<string>> {
  return runAction("tasks", async () => {
    const { scope } = await studioOfCaller();
    const id = await tasks.create(scope, parseInput(taskInputSchema, input));
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function updateTask(id: unknown, input: unknown): Promise<Result> {
  return runAction("tasks", async () => {
    const { scope } = await studioOfCaller();
    await tasks.update(scope, parseInput(taskIdSchema, id), parseInput(taskInputSchema, input));
    revalidatePath("/studio", "layout");
  });
}

export async function setTaskStatus(id: unknown, status: unknown): Promise<Result> {
  return runAction("tasks", async () => {
    const { scope } = await studioOfCaller();
    await tasks.setStatus(scope, parseInput(taskIdSchema, id), parseInput(taskStatusSchema, status));
    revalidatePath("/studio", "layout");
  });
}

export async function removeTask(id: unknown): Promise<Result> {
  return runAction("tasks", async () => {
    const { scope } = await studioOfCaller();
    await tasks.remove(scope, parseInput(taskIdSchema, id));
    revalidatePath("/studio", "layout");
  });
}
