// Checking input from outside (the browser, a shared link, another system)
// against a zod schema. Pure; safe on client and server.

import type { z } from "zod";

import { AppError } from "./result";

/**
 * The input, parsed and typed by `schema`, or an AppError listing what's wrong.
 * Write schema messages for the person filling the form ("Give the discount a
 * name."); they are shown as-is, joined into one sentence list.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const messages = [...new Set(parsed.error.issues.map((issue) => issue.message))];
  throw new AppError(messages.join(" "));
}
