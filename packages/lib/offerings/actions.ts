"use server";

// The browser's only entry point to services and packages. Today the caller
// is a studio owner managing their studio's, so the tenant always comes from
// the caller's studio (packages/lib/studios), never from the browser. An id
// from another studio is simply "not found".
//
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import {
  offeringIdSchema,
  offeringInputSchema,
  serviceIdSchema,
  serviceInputSchema,
  type Offering,
  type OfferingSaveOutcome,
  type Service,
  type ServiceSaveOutcome,
} from "./core";
import { offerings } from "./server";

const LIST = "/studio/offerings";

export async function createService(input: unknown): Promise<Result<ServiceSaveOutcome>> {
  return runAction("offerings", async () => {
    const { scope } = await studioOfCaller();
    const outcome = await offerings.createService(scope, parseInput(serviceInputSchema, input));
    revalidatePath(LIST);
    return outcome;
  });
}

export async function updateService(id: unknown, input: unknown): Promise<Result<ServiceSaveOutcome>> {
  return runAction("offerings", async () => {
    const { scope } = await studioOfCaller();
    const outcome = await offerings.updateService(scope, parseInput(serviceIdSchema, id), parseInput(serviceInputSchema, input));
    revalidatePath(LIST, "layout");
    return outcome;
  });
}

/** Takes a service and its packages off sale (or puts it back). */
export async function setServiceArchived(id: unknown, archived: unknown): Promise<Result<Service>> {
  return runAction("offerings", async () => {
    const { scope } = await studioOfCaller();
    const service = await offerings.setServiceArchived(scope, parseInput(serviceIdSchema, id), archived === true);
    revalidatePath(LIST, "layout");
    return service;
  });
}

export async function createOffering(serviceId: unknown, input: unknown): Promise<Result<OfferingSaveOutcome>> {
  return runAction("offerings", async () => {
    const { scope } = await studioOfCaller();
    const outcome = await offerings.createPackage(scope, parseInput(serviceIdSchema, serviceId), parseInput(offeringInputSchema, input));
    revalidatePath(LIST, "layout");
    return outcome;
  });
}

export async function updateOffering(id: unknown, input: unknown): Promise<Result<OfferingSaveOutcome>> {
  return runAction("offerings", async () => {
    const { scope } = await studioOfCaller();
    const outcome = await offerings.updatePackage(scope, parseInput(offeringIdSchema, id), parseInput(offeringInputSchema, input));
    revalidatePath(LIST, "layout");
    return outcome;
  });
}

/** Takes a package off sale (or puts it back). */
export async function setOfferingArchived(id: unknown, archived: unknown): Promise<Result<Offering>> {
  return runAction("offerings", async () => {
    const { scope } = await studioOfCaller();
    const offering = await offerings.setPackageArchived(scope, parseInput(offeringIdSchema, id), archived === true);
    revalidatePath(LIST, "layout");
    return offering;
  });
}
