"use server";

// The browser's only entry point to a studio's categories, services and
// packages, and its showroom settings. Today the caller is a studio owner
// managing their studio's, so the tenant always comes from the caller's
// studio (packages/lib/studios), never from the browser. An id from another
// studio is simply "not found".
//
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import {
  categoryIdSchema,
  categoryNameSchema,
  offeringIdSchema,
  offeringInputSchema,
  serviceDescriptionSchema,
  serviceIdSchema,
  serviceNameSchema,
  showroomSettingsSchema,
  type Category,
  type Offering,
  type SaveOutcome,
  type Service,
  type ShowroomSettings,
} from "./core";
import { offerings } from "./server";

/** Runs one change in the caller's studio and refreshes its Packages & Services page. */
function change<T>(work: (scope: Awaited<ReturnType<typeof studioOfCaller>>["scope"]) => Promise<T>): Promise<Result<T>> {
  return runAction("offerings", async () => {
    const { scope } = await studioOfCaller();
    const result = await work(scope);
    revalidatePath("/studio/offerings");
    return result;
  });
}

// --- Settings ----------------------------------------------------------------

export async function saveShowroomSettings(input: unknown): Promise<Result<ShowroomSettings>> {
  return change((scope) => offerings.saveSettings(scope, parseInput(showroomSettingsSchema, input)));
}

// --- Categories --------------------------------------------------------------

export async function createCategory(name: unknown): Promise<Result<SaveOutcome<Category>>> {
  return change((scope) => offerings.createCategory(scope, parseInput(categoryNameSchema, name)));
}

export async function renameCategory(id: unknown, name: unknown): Promise<Result<SaveOutcome<Category>>> {
  return change((scope) => offerings.renameCategory(scope, parseInput(categoryIdSchema, id), parseInput(categoryNameSchema, name)));
}

/** Deactivates a category (its services go off sale) or reactivates it. */
export async function setCategoryActive(id: unknown, active: unknown): Promise<Result<Category>> {
  return change((scope) => offerings.setCategoryArchived(scope, parseInput(categoryIdSchema, id), active !== true));
}

// --- Services ----------------------------------------------------------------

export async function createService(categoryId: unknown, name: unknown): Promise<Result<SaveOutcome<Service>>> {
  return change((scope) => offerings.createService(scope, parseInput(categoryIdSchema, categoryId), parseInput(serviceNameSchema, name)));
}

export async function renameService(id: unknown, name: unknown): Promise<Result<SaveOutcome<Service>>> {
  return change((scope) => offerings.renameService(scope, parseInput(serviceIdSchema, id), parseInput(serviceNameSchema, name)));
}

export async function setServiceDescription(id: unknown, description: unknown): Promise<Result<Service>> {
  return change((scope) =>
    offerings.setServiceDescription(scope, parseInput(serviceIdSchema, id), parseInput(serviceDescriptionSchema, description)),
  );
}

export async function moveService(id: unknown, categoryId: unknown): Promise<Result<Service>> {
  return change((scope) => offerings.moveService(scope, parseInput(serviceIdSchema, id), parseInput(categoryIdSchema, categoryId)));
}

/** Takes a service and its packages off sale (or puts it back). */
export async function setServiceActive(id: unknown, active: unknown): Promise<Result<Service>> {
  return change((scope) => offerings.setServiceArchived(scope, parseInput(serviceIdSchema, id), active !== true));
}

// --- Packages ----------------------------------------------------------------

export async function createOffering(serviceId: unknown, input: unknown): Promise<Result<SaveOutcome<Offering>>> {
  return change((scope) => offerings.createPackage(scope, parseInput(serviceIdSchema, serviceId), parseInput(offeringInputSchema, input)));
}

export async function updateOffering(id: unknown, input: unknown): Promise<Result<SaveOutcome<Offering>>> {
  return change((scope) => offerings.updatePackage(scope, parseInput(offeringIdSchema, id), parseInput(offeringInputSchema, input)));
}

/** Takes a package off sale (or puts it back). */
export async function setOfferingActive(id: unknown, active: unknown): Promise<Result<Offering>> {
  return change((scope) => offerings.setPackageArchived(scope, parseInput(offeringIdSchema, id), active !== true));
}
