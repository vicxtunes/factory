"use server";

// The browser's only entry point to the team. The tenant always comes from
// the caller's studio (packages/lib/studios), never from the browser.
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import { teamMemberIdSchema, teamMemberInputSchema } from "./core";
import { team } from "./server";

export async function createTeamMember(input: unknown): Promise<Result<string>> {
  return runAction("team", async () => {
    const { scope } = await studioOfCaller();
    const id = await team.create(scope, parseInput(teamMemberInputSchema, input));
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function updateTeamMember(id: unknown, input: unknown): Promise<Result> {
  return runAction("team", async () => {
    const { scope } = await studioOfCaller();
    await team.update(scope, parseInput(teamMemberIdSchema, id), parseInput(teamMemberInputSchema, input));
    revalidatePath("/studio", "layout");
  });
}

export async function setTeamMemberArchived(id: unknown, archived: unknown): Promise<Result> {
  return runAction("team", async () => {
    const { scope } = await studioOfCaller();
    await team.setArchived(scope, parseInput(teamMemberIdSchema, id), archived === true);
    revalidatePath("/studio", "layout");
  });
}
