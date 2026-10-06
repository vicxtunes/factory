"use server";

// The browser's only entry point to studio access. Every action: who's asking
// (the studio always comes from the session) → parse the input (zod) →
// service → Result (packages/lib/kernel).

import { revalidatePath } from "next/cache";

import { getDashboardSession } from "@repo/lib/auth/session";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { canViewAllStudios } from "@repo/lib/studios/policy";
import { ownStudio, studioForSetup } from "@repo/lib/studios/server";

import { codeSchema, detailsSchema, emailSchema, newPasswordSchema, resetSchema, reviewSchema, unlockSchema, uploadKeySchema } from "./core";
import { AccessError } from "./ports";
import { setUnlockCookie, studioAccess } from "./server";
import type { CodeSent } from "./service";

const run = <T>(work: () => Promise<T>) => runAction("studio-access", work);
const refresh = () => revalidatePath("/studio", "layout");

// ── Onboarding (the owner's own studio) ──

export async function saveStudioDetails(input: unknown): Promise<Result> {
  return run(async () => {
    const { studio } = await ownStudio();
    await studioAccess.saveDetails(studio.id, parseInput(detailsSchema, input));
    refresh();
  });
}

export async function startStudioLogoUpload(): Promise<Result<{ key: string; url: string }>> {
  return run(async () => {
    const { studio } = await studioForSetup();
    return studioAccess.startLogoUpload(studio.id);
  });
}

export async function confirmStudioLogo(key: unknown): Promise<Result> {
  return run(async () => {
    const { studio } = await studioForSetup();
    await studioAccess.confirmLogo(studio.id, parseInput(uploadKeySchema, key));
    refresh();
  });
}

export async function sendStudioEmailCode(email: unknown): Promise<Result<CodeSent>> {
  return run(async () => {
    const { studio } = await ownStudio();
    return studioAccess.sendVerifyCode(studio.id, parseInput(emailSchema, email));
  });
}

export async function verifyStudioEmail(code: unknown): Promise<Result> {
  return run(async () => {
    const { studio } = await ownStudio();
    await studioAccess.verifyEmail(studio.id, parseInput(codeSchema, code));
    refresh();
  });
}

/** Sets the studio password during set-up; this device is unlocked with it. */
export async function setStudioPassword(input: unknown): Promise<Result> {
  return run(async () => {
    const { studio } = await ownStudio();
    await setUnlockCookie(await studioAccess.setPassword(studio.id, parseInput(newPasswordSchema, input)));
    refresh();
  });
}

export async function submitStudioForReview(): Promise<Result> {
  return run(async () => {
    const { studio } = await ownStudio();
    await studioAccess.submit(studio.id);
    refresh();
  });
}

// ── The studio password ──

export async function unlockStudio(password: unknown): Promise<Result> {
  return run(async () => {
    const { studio } = await ownStudio();
    await setUnlockCookie(await studioAccess.unlock(studio.id, parseInput(unlockSchema, password)));
    refresh();
  });
}

export async function sendStudioResetCode(): Promise<Result<CodeSent>> {
  return run(async () => {
    const { studio } = await ownStudio();
    return studioAccess.sendResetCode(studio.id);
  });
}

/** A new password from the emailed code: other devices are signed out, this one is unlocked. */
export async function resetStudioPassword(input: unknown): Promise<Result> {
  return run(async () => {
    const { studio } = await ownStudio();
    const { code, password } = parseInput(resetSchema, input);
    await setUnlockCookie(await studioAccess.resetPassword(studio.id, code, password));
    refresh();
  });
}

// ── The boss's review ──

export async function reviewStudio(input: unknown): Promise<Result> {
  return run(async () => {
    const session = await getDashboardSession();
    if (!session || !canViewAllStudios(session.role)) throw new AccessError("Only the boss can review businesses.");
    const { studioId, decision, note } = parseInput(reviewSchema, input);
    await studioAccess.review(studioId, decision, note);
    revalidatePath("/dashboard/studios", "layout");
  });
}
