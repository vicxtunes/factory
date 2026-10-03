"use server";

// The browser's only entry point to studios. Every action: who's asking →
// parse the input (zod) → service → Result (packages/lib/kernel).

import { revalidatePath } from "next/cache";

import { getClientSession } from "@repo/lib/auth/session";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";

import { studioProfileSchema, type Studio } from "./core";
import { STUDIOS_ENABLED } from "./feature";
import { StudioError } from "./ports";
import { ownerOf, studios } from "./server";

/** Saves the signed-in client's own studio profile. */
export async function saveMyStudioProfile(input: unknown): Promise<Result<Studio>> {
  return runAction("studios", async () => {
    const session = STUDIOS_ENABLED ? await getClientSession() : null;
    if (!session) throw new StudioError("Sign in to manage your studio.");
    const studio = await studios.updateProfile(ownerOf(session), parseInput(studioProfileSchema, input));
    revalidatePath("/studio");
    return studio;
  });
}
