// The shape of task input arriving from outside (zod). Pure.

import { z } from "zod";

import type { TaskInput } from "./model";

export const taskIdSchema = z.uuid("That task doesn't exist.");

export const taskInputSchema = z
  .object({
    projectId: z.uuid("Choose a project."),
    title: z.string("Describe the task.").trim().min(1, "Describe the task.").max(200, "Keep the task under 200 characters."),
    assigneeId: z.uuid("Choose someone from the team.").nullable(),
    customerId: z.uuid("Choose the client.").nullable().default(null),
    dueOn: z.iso.date("Choose a valid due date.").nullable(),
    priority: z.enum(["low", "normal", "high"], "Choose a priority."),
    kind: z.enum(["todo", "choose", "feedback", "name"], "Choose what kind of task.").default("todo"),
    folderId: z.uuid("Choose a folder.").nullable().default(null),
    pickMin: z.number().int().min(0, "Can't be below 0.").max(10000).nullable().default(null),
    pickMax: z.number().int().min(1, "At least 1.").max(10000, "At most 10,000.").nullable().default(null),
  })
  .superRefine((t, ctx) => {
    const problem = (message: string) => ctx.addIssue({ code: "custom", message });
    if (t.assigneeId && t.customerId) problem("Give it to a team member or to the client, not both.");
    if (t.kind !== "todo" && !t.folderId) problem("Choose the folder with the photos.");
    if (t.kind === "choose" && t.pickMax === null) problem("Say how many photos to choose.");
    if (t.kind === "choose" && t.pickMin !== null && t.pickMax !== null && t.pickMin > t.pickMax) problem("The least can't be more than the most.");
  })
  .transform((t) => (t.kind === "choose" ? t : { ...t, pickMin: null, pickMax: null })) satisfies z.ZodType<TaskInput, unknown>;

export const taskStatusSchema = z.enum(["pending", "in_progress", "done"], "Choose a status.");
