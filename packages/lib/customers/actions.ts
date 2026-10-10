"use server";

// The browser's only entry point to customers. Today the caller is a studio
// owner managing their studio's clients, so the tenant always comes from the
// caller's studio (packages/lib/studios), never from the browser. An id from
// another studio is simply "not found".
//
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { deleteStudioRecord, studioOfCaller } from "@repo/lib/studios/server";

import { customerIdSchema, customerInputSchema, type Customer, type SaveOutcome } from "./core";
import { customers } from "./server";

const LIST = "/studio/clients";

export async function createCustomer(input: unknown): Promise<Result<SaveOutcome>> {
  return runAction("customers", async () => {
    const { scope } = await studioOfCaller("clients");
    const outcome = await customers.create(scope, parseInput(customerInputSchema, input));
    revalidatePath(LIST);
    return outcome;
  });
}

export async function updateCustomer(id: unknown, input: unknown): Promise<Result<SaveOutcome>> {
  return runAction("customers", async () => {
    const { scope } = await studioOfCaller("clients");
    const outcome = await customers.update(scope, parseInput(customerIdSchema, id), parseInput(customerInputSchema, input));
    revalidatePath(LIST, "layout");
    return outcome;
  });
}

/** Archives a customer (or restores one). */
export async function setCustomerArchived(id: unknown, archived: unknown): Promise<Result<Customer>> {
  return runAction("customers", async () => {
    const { scope } = await studioOfCaller("clients");
    const customer = await customers.setArchived(scope, parseInput(customerIdSchema, id), archived === true);
    revalidatePath(LIST, "layout");
    return customer;
  });
}

/** Deletes the client for good, with their bookings, projects, quotations, invoices and order requests. */
export async function deleteCustomer(id: unknown): Promise<Result> {
  return runAction("customers", async () => {
    const { scope } = await studioOfCaller("clients");
    await deleteStudioRecord(scope, "customer", parseInput(customerIdSchema, id));
    revalidatePath("/studio", "layout");
  });
}
