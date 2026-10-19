"use server";

// The browser's only entry point to the team. The tenant always comes from
// the caller's studio (packages/lib/studios), never from the browser, and
// only its owner manages the team. Joining is the one action for a team
// member: the invite link's token is what chooses the studio.
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { getClientSession } from "@repo/lib/auth/session";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { notifyActor } from "@repo/lib/push/send";
import { STUDIO_CHOICE_COOKIE, deleteStudioRecord, studioOfCaller, studios } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { accessSchema, inviteTokenSchema, teamMemberIdSchema, teamMemberInputSchema } from "./core";
import { TeamError } from "./ports";
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

/** What they may use in the studio. It applies from their next page; they're told. */
export async function setTeamAccess(id: unknown, access: unknown): Promise<Result> {
  return runAction("team", async () => {
    const { scope, studio } = await studioOfCaller();
    const memberId = parseInput(teamMemberIdSchema, id);
    await team.setAccess(scope, memberId, parseInput(accessSchema, access));
    await tellMember(scope, memberId, { title: studio.name, body: "What you can use in the business changed.", url: "/studio" });
    revalidatePath("/studio", "layout");
  });
}

/** A new invite link for them to sign in with (an earlier one stops working). Returns the link to send. */
export async function inviteTeamMember(id: unknown): Promise<Result<string>> {
  return runAction("team", async () => {
    const { scope } = await studioOfCaller();
    const token = await team.invite(scope, parseInput(teamMemberIdSchema, id));
    revalidatePath("/studio", "layout");
    return clientUrl(`/studio/join/${token}`);
  });
}

/** Their sign-in stops working at once (and any invite link); they're told. They stay on the team for tasks. */
export async function removeTeamAccess(id: unknown): Promise<Result> {
  return runAction("team", async () => {
    const { scope, studio } = await studioOfCaller();
    const memberId = parseInput(teamMemberIdSchema, id);
    // Their account, read before it's unlinked.
    const member = await team.get(scope, memberId);
    await team.removeAccess(scope, memberId);
    if (member?.accountId) await notifyActor({ type: "client", id: member.accountId }, { title: studio.name, body: "You no longer have access to this business.", url: "/" });
    revalidatePath("/studio", "layout");
  });
}

/** The signed-in account joins a studio's team through its invite link; this device then works in that studio. */
export async function joinTeam(token: unknown): Promise<Result> {
  return runAction("team", async () => {
    const session = await getClientSession();
    if (!session) throw new TeamError("Sign in to your Aming account first.");
    const { tenantId } = await team.join(parseInput(inviteTokenSchema, token), session.client_id);
    const owner = (await studios.get(tenantId))?.ownerClientId;
    if (owner) await notifyActor({ type: "client", id: owner }, { title: "Someone joined your team", body: `${session.name} can now sign in to your business.`, url: "/studio/team" });
    (await cookies()).set(STUDIO_CHOICE_COOKIE, tenantId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 400 * 86_400,
    });
    revalidatePath("/studio", "layout");
  });
}

/** Deletes the team member for good (owner only); their tasks stay, unassigned. */
export async function deleteTeamMember(id: unknown): Promise<Result> {
  return runAction("team", async () => {
    const { scope } = await studioOfCaller();
    await deleteStudioRecord(scope, "team_member", parseInput(teamMemberIdSchema, id));
    revalidatePath("/studio", "layout");
  });
}

/** Tells a team member who has joined (has an account) something about the business. */
async function tellMember(scope: TenantScope, memberId: string, message: { title: string; body: string; url: string }): Promise<void> {
  const member = await team.get(scope, memberId);
  if (member?.accountId) await notifyActor({ type: "client", id: member.accountId }, message);
}
