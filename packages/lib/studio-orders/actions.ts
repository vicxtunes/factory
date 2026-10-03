"use server";

// The browser's only entry point to studio orders. The studio (and its owner)
// always come from the session, never from the browser: a studio can only
// link orders its owner placed, to its own projects.
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { projectIdSchema } from "@repo/lib/projects/core";
import { studioOfCaller } from "@repo/lib/studios/server";

import { orderIdSchema } from "./core";
import { studioOrders } from "./server";

export async function linkOrderToProject(projectId: unknown, orderId: unknown): Promise<Result> {
  return runAction("studio-orders", async () => {
    const { scope } = await studioOfCaller();
    await studioOrders.link(scope, parseInput(projectIdSchema, projectId), parseInput(orderIdSchema, orderId));
    revalidatePath("/studio", "layout");
  });
}

export async function unlinkOrderFromProject(projectId: unknown, orderId: unknown): Promise<Result> {
  return runAction("studio-orders", async () => {
    const { scope } = await studioOfCaller();
    await studioOrders.unlink(scope, parseInput(projectIdSchema, projectId), parseInput(orderIdSchema, orderId));
    revalidatePath("/studio", "layout");
  });
}
