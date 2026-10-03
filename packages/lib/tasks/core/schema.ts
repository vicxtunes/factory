// The shape of task input arriving from outside (zod). Pure.

import { z } from "zod";

import type { TaskInput } from "./model";

export const taskIdSchema = z.uuid("That task doesn't exist.");

export const taskInputSchema = z.object({
  projectId: z.uuid("Choose a project."),
  title: z.string("Describe the task.").trim().min(1, "Describe the task.").max(200, "Keep the task under 200 characters."),
  assigneeId: z.uuid("Choose someone from the team.").nullable(),
  dueOn: z.iso.date("Choose a valid due date.").nullable(),
  priority: z.enum(["low", "normal", "high"], "Choose a priority."),
}) satisfies z.ZodType<TaskInput, unknown>;

export const taskStatusSchema = z.enum(["pending", "in_progress", "done"], "Choose a status.");
