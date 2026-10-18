"use server";

// The browser's only entry point to studios. Every action: who's asking →
// parse the input (zod) → service → Result (packages/lib/kernel).

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";

import { brandColorSchema, showOnAmingSchema, studioIdSchema, studioProfileSchema, type Studio } from "./core";
import { StudioError } from "./ports";
import { getClientSession } from "@repo/lib/auth/session";
import { STUDIO_CHOICE_COOKIE, studioOfCaller, studios, studiosOf } from "./server";

/** Saves the signed-in client's own studio profile. */
export async function saveMyStudioProfile(input: unknown): Promise<Result<Studio>> {
  return runAction("studios", async () => {
    const { studio } = await studioOfCaller();
    const saved = await studios.updateProfile(studio.id, parseInput(studioProfileSchema, input));
    revalidatePath("/studio", "layout");
    return saved;
  });
}

/** Sets the signed-in client's own studio's brand color. */
export async function saveMyBrandColor(input: unknown): Promise<Result<Studio>> {
  return runAction("studios", async () => {
    const { studio } = await studioOfCaller();
    const saved = await studios.setBrandColor(studio.id, parseInput(brandColorSchema, input).color);
    revalidatePath("/studio", "layout");
    return saved;
  });
}

/** Shows the owner's business's public work in the feed on Aming's front page, or stops. */
export async function saveShowOnAming(input: unknown): Promise<Result<Studio>> {
  return runAction("studios", async () => {
    const { studio, access } = await studioOfCaller();
    if (!access.owner) throw new StudioError("Only the business's owner can change this.");
    const saved = await studios.setShowOnAming(studio.id, parseInput(showOnAmingSchema, input).on);
    revalidatePath("/studio/showroom");
    revalidatePath("/");
    return saved;
  });
}

/**
 * Which business this device works in, for an account that can open more
 * than one: one it works for (by id), or "own": its own (started now if it
 * has none).
 */
export async function chooseStudio(choice: unknown): Promise<Result> {
  return runAction("studios", async () => {
    const session = await getClientSession();
    if (!session) throw new StudioError("Sign in first.");
    const store = await cookies();
    if (choice === "own") {
      store.delete(STUDIO_CHOICE_COOKIE);
    } else {
      const id = parseInput(studioIdSchema, choice);
      const { working } = await studiosOf(session.client_id);
      if (!working.some((w) => w.studio.id === id)) throw new StudioError("You don't work for that business.");
      store.set(STUDIO_CHOICE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 86_400 });
    }
    revalidatePath("/studio", "layout");
  });
}
