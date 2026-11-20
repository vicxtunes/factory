"use server";

// The browser's entry points to a business's books. The business always comes
// from the caller (studioOfCaller("money")), never from the browser.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import { accountInputSchema, bookIdSchema, employeeInputSchema, entryInputSchema, looksDuplicate } from "./core";
import { archiveBookAccount, bookLines, deleteBookEntry, saveBookAccount, saveBookEntry, saveEmployee } from "./server";

const done = () => revalidatePath("/studio", "layout");

export async function saveAccount(id: unknown, input: unknown): Promise<Result> {
  return runAction("business-books", async () => {
    const { scope } = await studioOfCaller("money");
    await saveBookAccount(scope, id == null ? null : parseInput(bookIdSchema, id), parseInput(accountInputSchema, input));
    done();
  });
}

export async function removeAccount(id: unknown): Promise<Result> {
  return runAction("business-books", async () => {
    const { scope } = await studioOfCaller("money");
    await archiveBookAccount(scope, parseInput(bookIdSchema, id));
    done();
  });
}

/**
 * Records money in, out or moved (or changes an entry). One that looks like
 * an entry already there (same day, amount and category) waits for `sure`:
 * the answer is { duplicate: true } and nothing is saved.
 */
export async function saveEntry(id: unknown, input: unknown, sure = false): Promise<Result<{ duplicate: boolean }>> {
  return runAction("business-books", async () => {
    const { scope, session } = await studioOfCaller("money");
    const entryId = id == null ? null : parseInput(bookIdSchema, id);
    const entry = parseInput(entryInputSchema, input);
    if (!sure && entry.kind !== "move" && looksDuplicate(await bookLines(scope), { id: entryId, direction: entry.kind, amount: entry.amount, occurredOn: entry.occurredOn, category: entry.category })) {
      return { duplicate: true };
    }
    await saveBookEntry(scope, entryId, entry, { id: session.client_id, name: session.name });
    done();
    return { duplicate: false };
  });
}

export async function deleteEntry(id: unknown): Promise<Result> {
  return runAction("business-books", async () => {
    const { scope, session } = await studioOfCaller("money");
    await deleteBookEntry(scope, parseInput(bookIdSchema, id), session.name);
    done();
  });
}

export async function saveEmployeeAction(id: unknown, input: unknown): Promise<Result> {
  return runAction("business-books", async () => {
    const { scope } = await studioOfCaller("money");
    await saveEmployee(scope, id == null ? null : parseInput(bookIdSchema, id), parseInput(employeeInputSchema, input));
    done();
  });
}
