"use server";

// The browser's only entry point to projects. The tenant always comes from
// the caller's studio (packages/lib/studios), never from the browser; an id
// from another studio is simply "not found". The acting person, recorded in
// a project's history, is the signed-in owner.
//
// Every action: whose studio → parse the input (zod) → service → Result.

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { bookingIdSchema } from "@repo/lib/bookings/core";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { customers } from "@repo/lib/customers/server";
import { resendMailer } from "@repo/lib/studio-access/adapters/resend/mailer";
import { LOGO_CID } from "@repo/lib/studio-access/core/emails";
import { portal } from "@repo/lib/studio-portal/server";
import { deleteStudioRecord, studioOfCaller } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { projectIdSchema, projectInputSchema, projectStatusSchema } from "./core";
import { projectStageEmail } from "./core/emails";
import { projects } from "./server";

/** Starts the project for a confirmed booking, or opens the one already started. */
export async function startProjectFromBooking(bookingId: unknown): Promise<Result<string>> {
  return runAction("projects", async () => {
    const { scope, session } = await studioOfCaller("projects");
    const id = await projects.startFromBooking(scope, parseInput(bookingIdSchema, bookingId), { name: session.name });
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function createProject(input: unknown): Promise<Result<string>> {
  return runAction("projects", async () => {
    const { scope, session } = await studioOfCaller("projects");
    const id = await projects.create(scope, parseInput(projectInputSchema, input), { name: session.name });
    revalidatePath("/studio", "layout");
    return id;
  });
}

export async function updateProject(id: unknown, input: unknown): Promise<Result> {
  return runAction("projects", async () => {
    const { scope } = await studioOfCaller("projects");
    await projects.update(scope, parseInput(projectIdSchema, id), parseInput(projectInputSchema, input));
    revalidatePath("/studio", "layout");
  });
}

export async function setProjectStatus(id: unknown, status: unknown): Promise<Result> {
  return runAction("projects", async () => {
    const { scope, session, studio } = await studioOfCaller("projects");
    const projectId = parseInput(projectIdSchema, id);
    const to = parseInput(projectStatusSchema, status);
    await projects.setStatus(scope, projectId, to, { name: session.name });
    revalidatePath("/studio", "layout");
    // The customer hears it started or finished (by email: they have no app), after the answer.
    if (to !== "upcoming") after(() => emailCustomer(scope, studio.name, projectId, to).catch((err) => console.error("project email failed:", projectId, err)));
  });
}

/** Emails the project's customer that it's being worked on, or done; nothing when they have no email. */
async function emailCustomer(scope: TenantScope, studio: string, projectId: string, to: "in_progress" | "done"): Promise<void> {
  const view = await projects.get(scope, projectId);
  const customer = view ? await customers.get(scope, view.project.customerId) : null;
  if (!view || !customer?.email) return;
  const slug = await portal.currentSlug(scope.tenantId);
  const email = projectStageEmail(
    { workspace: clientUrl("/studio"), logo: `cid:${LOGO_CID}` },
    { studio, customer: customer.name, title: view.project.title, to, pageUrl: slug ? clientUrl(`/${slug}`) : null },
  );
  await resendMailer.send({ to: customer.email, ...email });
}

/** Deletes the project for good, with its tasks and albums. */
export async function deleteProject(id: unknown): Promise<Result> {
  return runAction("projects", async () => {
    const { scope } = await studioOfCaller("projects");
    await deleteStudioRecord(scope, "project", parseInput(projectIdSchema, id));
    revalidatePath("/studio", "layout");
  });
}
