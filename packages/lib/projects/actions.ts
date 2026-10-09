"use server";

// The browser's only entry point to projects. The tenant always comes from
// the caller's studio (packages/lib/studios), never from the browser; an id
// from another studio is simply "not found". The acting person, recorded in
// a project's history, is the signed-in owner.
//
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { bookingIdSchema } from "@repo/lib/bookings/core";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import { projectIdSchema, projectInputSchema, projectStatusSchema } from "./core";
import { projects } from "./server";

/** Starts the project for a confirmed booking, or opens the one already started. */
export async function startProjectFromBooking(bookingId: unknown): Promise<Result<string>> {
  return runAction("projects", async () => {
    const { scope, session } = await studioOfCaller("projects");
    const id = await projects.startFromBooking(scope, parseInput(bookingIdSchema, bookingId), { name: session.name });
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function createProject(input: unknown): Promise<Result<string>> {
  return runAction("projects", async () => {
    const { scope, session } = await studioOfCaller("projects");
    const id = await projects.create(scope, parseInput(projectInputSchema, input), { name: session.name });
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function updateProject(id: unknown, input: unknown): Promise<Result> {
  return runAction("projects", async () => {
    const { scope } = await studioOfCaller("projects");
    await projects.update(scope, parseInput(projectIdSchema, id), parseInput(projectInputSchema, input));
    revalidatePath("/studio", "layout");
  });
}

export async function setProjectStatus(id: unknown, status: unknown): Promise<Result> {
  return runAction("projects", async () => {
    const { scope, session } = await studioOfCaller("projects");
    await projects.setStatus(scope, parseInput(projectIdSchema, id), parseInput(projectStatusSchema, status), { name: session.name });
    revalidatePath("/studio", "layout");
  });
}
