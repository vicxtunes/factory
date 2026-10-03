"use server";

// The browser's only entry point to offerings. Today the caller is a studio
// owner managing their studio's packages and services, so the tenant always
// comes from the caller's studio (packages/lib/studios), never from the
// browser. An id from another studio is simply "not found".
//
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import { offeringIdSchema, offeringInputSchema, type Offering, type OfferingSaveOutcome } from "./core";
import { offerings } from "./server";

const LIST = "/studio/offerings";

export async function createOffering(input: unknown): Promise<Result<OfferingSaveOutcome>> {
  return runAction("offerings", async () => {
    const { scope } = await studioOfCaller();
    const outcome = await offerings.create(scope, parseInput(offeringInputSchema, input));
    revalidatePath(LIST);
    return outcome;
  });
}

export async function updateOffering(id: unknown, input: unknown): Promise<Result<OfferingSaveOutcome>> {
  return runAction("offerings", async () => {
    const { scope } = await studioOfCaller();
    const outcome = await offerings.update(scope, parseInput(offeringIdSchema, id), parseInput(offeringInputSchema, input));
    revalidatePath(LIST, "layout");
    return outcome;
  });
}

/** Takes an offering off sale (or puts it back). */
export async function setOfferingArchived(id: unknown, archived: unknown): Promise<Result<Offering>> {
  return runAction("offerings", async () => {
    const { scope } = await studioOfCaller();
    const offering = await offerings.setArchived(scope, parseInput(offeringIdSchema, id), archived === true);
    revalidatePath(LIST, "layout");
    return offering;
  });
}
