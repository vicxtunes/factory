"use server";

// The browser's only entry point to studios. Every action: who's asking →
// parse the input (zod) → service → Result (packages/lib/kernel).

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";

import { studioProfileSchema, type Studio } from "./core";
import { studioOfCaller, studios } from "./server";

/** Saves the signed-in client's own studio profile. */
export async function saveMyStudioProfile(input: unknown): Promise<Result<Studio>> {
  return runAction("studios", async () => {
    const { studio } = await studioOfCaller();
    const saved = await studios.updateProfile(studio.id, parseInput(studioProfileSchema, input));
    revalidatePath("/studio");
    return saved;
  });
}
