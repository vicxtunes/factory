"use server";

import { revalidatePath } from "next/cache";

import { getDashboardSession } from "@repo/lib/auth/session";
import { AppError, parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";

import { canManageProduction } from "../policy";
import { sheetSaveSchema } from "./schema";
import { saveSheets } from "./server";

export async function saveSheetPrices(input: unknown): Promise<Result> {
  return runAction("sheets", async () => {
    const session = await getDashboardSession();
    if (!session || !canManageProduction(session.role)) throw new AppError("Only the boss and supervisors can change sheet prices.");
    const parsed = parseInput(sheetSaveSchema, input);
    await saveSheets(parsed, { id: session.userId, name: session.fullName ?? session.email ?? "Staff" });
    revalidatePath(`/dashboard/production/products/${parsed.productId}`, "layout");
  });
}
