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
  serviceFormSchema,
  serviceIdSchema,
  type Offering,
  type SaveOutcome,
  type Service,
  type ServiceWithPackages,
} from "./core";
import { offerings } from "./server";

const LIST = "/studio/offerings";

/** Saves the service form: the service (new when `id` is null) and its packages, together. */
export async function saveService(id: unknown, input: unknown): Promise<Result<SaveOutcome<ServiceWithPackages> | { duplicateOf: Service }>> {
  return runAction("offerings", async () => {
    const { scope } = await studioOfCaller();
    const outcome = await offerings.saveService(scope, id === null ? null : parseInput(serviceIdSchema, id), parseInput(serviceFormSchema, input));
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

/** Takes a package off sale (or puts it back). */
export async function setOfferingArchived(id: unknown, archived: unknown): Promise<Result<Offering>> {
  return runAction("offerings", async () => {
    const { scope } = await studioOfCaller();
    const offering = await offerings.setPackageArchived(scope, parseInput(offeringIdSchema, id), archived === true);
    revalidatePath(LIST, "layout");
    return offering;
  });
}
