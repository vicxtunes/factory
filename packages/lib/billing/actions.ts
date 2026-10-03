"use server";

// The browser's only entry points to billing.
//
// Studio actions: the tenant always comes from the caller's studio
// (packages/lib/studios), never from the browser; an id from another studio
// is simply "not found". Link actions: the token is the only input that
// chooses the document, and they do nothing but answer that one quotation.
//
// Every action: who / which document → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import { quotationIdSchema, quotationInputSchema, quotationResponseSchema, shareTokenSchema } from "./core";
import { quotations } from "./server";

const LIST = "/studio/quotations";

export async function createQuotation(input: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    const id = await quotations.create(scope, parseInput(quotationInputSchema, input));
    revalidatePath(LIST);
    return id;
  });
}

export async function updateQuotation(id: unknown, input: unknown): Promise<Result<string>> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    const saved = await quotations.update(scope, parseInput(quotationIdSchema, id), parseInput(quotationInputSchema, input));
    revalidatePath(LIST, "layout");
    return saved;
  });
}

/** A new link for the quotation; the old one stops working. */
export async function resetQuotationLink(id: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const { scope } = await studioOfCaller();
    await quotations.resetLink(scope, parseInput(quotationIdSchema, id));
    revalidatePath(LIST, "layout");
  });
}

/** The customer accepts or declines, through the link. No sign-in: the token is the permission. */
export async function respondToQuotation(token: unknown, answer: unknown): Promise<Result> {
  return runAction("billing", async () => {
    const link = parseInput(shareTokenSchema, token);
    await quotations.respond(link, parseInput(quotationResponseSchema, answer));
    revalidatePath(`/q/${link}`);
  });
}
