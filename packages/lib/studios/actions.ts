"use server";

// The browser's only entry point to studios. Every action: who's asking →
// parse the input (zod) → service → Result (packages/lib/kernel).

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";

import { isSettingUp } from "@repo/lib/studio-access/core";

import { brandColorSchema, businessKindSchema, showOnAmingSchema, vendorJoinSchema, studioIdSchema, studioProfileSchema, type Studio } from "./core";
import { StudioError } from "./ports";
import { getClientSession } from "@repo/lib/auth/session";
import { ownStudio, STUDIO_CHOICE_COOKIE, studioOfCaller, studios, studiosOf } from "./server";

const remember = async (id: string) =>
  (await cookies()).set(STUDIO_CHOICE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 86_400 });

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
 * than one: one of its own or one it works for (by id), or "own": its own
 * (the studio first; started now if it has none).
 */
export async function chooseStudio(choice: unknown): Promise<Result> {
  return runAction("studios", async () => {
    const session = await getClientSession();
    if (!session) throw new StudioError("Sign in first.");
    if (choice === "own") {
      (await cookies()).delete(STUDIO_CHOICE_COOKIE);
    } else {
      const id = parseInput(studioIdSchema, choice);
      const { owned, working } = await studiosOf(session.client_id);
      const mine = owned.studio?.id === id || owned.vendor?.id === id;
      if (!mine && !working.some((w) => w.studio.id === id)) throw new StudioError("You don't work for that business.");
      await remember(id);
    }
    revalidatePath("/studio", "layout");
  });
}

/**
 * Opens the signed-in account's other business (a vendor business beside its
 * studio, or the other way round) and works in it on this device. It starts
 * being set up, like any new business.
 */
export async function openBusiness(input: unknown): Promise<Result> {
  return runAction("studios", async () => {
    const session = await getClientSession();
    if (!session) throw new StudioError("Sign in first.");
    const what = parseInput(businessKindSchema, input);
    const business = await studios.open({ clientId: session.client_id, name: session.name }, what.kind, what.kind === "vendor" ? what.category : null);
    await remember(business.id);
    revalidatePath("/studio", "layout");
  });
}

/** Opens the signed-in account's vendor business with its sign-up answers (/vendors/join), and works in it. */
export async function joinAsVendor(input: unknown): Promise<Result> {
  return runAction("studios", async () => {
    const session = await getClientSession();
    if (!session) throw new StudioError("Sign in first.");
    const vendor = await studios.joinAsVendor({ clientId: session.client_id, name: session.name }, parseInput(vendorJoinSchema, input));
    await remember(vendor.id);
    revalidatePath("/studio", "layout");
  });
}

/** What the caller's own business is (a studio, or a vendor and its category), while it's being set up. */
export async function setMyBusinessKind(input: unknown): Promise<Result<Studio>> {
  return runAction("studios", async () => {
    const { studio } = await ownStudio();
    if (!isSettingUp(studio.status)) throw new StudioError("What your business is can only change while it's being set up. Ask Aming.");
    const what = parseInput(businessKindSchema, input);
    const saved = await studios.setKind(studio.id, what.kind, what.kind === "vendor" ? what.category : null);
    revalidatePath("/studio", "layout");
    return saved;
  });
}
