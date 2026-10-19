"use server";

// Vendor actions for the signed-in account.

import { revalidatePath } from "next/cache";

import { getClientSession, getDashboardSession } from "@repo/lib/auth/session";
import { canViewAccounts } from "@repo/lib/accounting/policy";
import { files } from "@repo/lib/files/server";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";

import { studioOfCaller } from "@repo/lib/studios/server";
import { z } from "zod";

import {
  disputeReasonSchema,
  jobIdSchema,
  jobRequestSchema,
  pictureKeySchema,
  settlementSchema,
  vendorJoinSchema,
  vendorPictureSchema,
  vendorProfileSchema,
  vendorSearchSchema,
  type Vendor,
} from "./core";
import { VendorError } from "./ports";
import { vendorJobs, vendors } from "./server";

/** The signed-in account joins as a vendor with its answers (/vendors/join). Its side is /vendors. */
export async function joinAsVendor(input: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const session = await getClientSession();
    if (!session) throw new VendorError("Sign in first.");
    await vendors.join({ clientId: session.client_id, name: session.name }, parseInput(vendorJoinSchema, input));
    revalidatePath("/vendors");
  });
}

/** The signed-in vendor saves their profile (/vendors/profile/edit). */
export async function saveVendorProfile(input: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const session = await getClientSession();
    if (!session) throw new VendorError("Sign in first.");
    await vendors.updateProfile(session.client_id, parseInput(vendorProfileSchema, input));
    revalidatePath("/vendors", "layout");
  });
}

/** A signed link to upload the signed-in vendor's profile photo or cover to (already shrunk in the browser). */
export async function startVendorPictureUpload(which: unknown): Promise<Result<{ key: string; url: string }>> {
  return runAction("vendors", async () => {
    const session = await getClientSession();
    if (!session) throw new VendorError("Sign in first.");
    return vendors.startPictureUpload(session.client_id, parseInput(vendorPictureSchema, which));
  });
}

/** Makes the uploaded picture the signed-in vendor's profile photo or cover. */
export async function confirmVendorPicture(which: unknown, key: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const session = await getClientSession();
    if (!session) throw new VendorError("Sign in first.");
    await vendors.confirmPicture(session.client_id, parseInput(vendorPictureSchema, which), parseInput(pictureKeySchema, key));
    revalidatePath("/vendors", "layout");
  });
}

// ── Jobs: the vendor ──

/** The signed-in vendor accepts or declines a job request. */
export async function respondToJob(id: unknown, accept: unknown): Promise<Result> {
  return vendorJob(id, (clientId, jobId) => vendorJobs.respond(clientId, jobId, parseInput(z.boolean(), accept)));
}

/** The signed-in vendor's samples are in the job's folder. */
export async function sendSamples(id: unknown): Promise<Result> {
  return vendorJob(id, (clientId, jobId) => vendorJobs.sendSamples(clientId, jobId));
}

/** The signed-in vendor says the work is done, in the job's folder. */
export async function deliverJob(id: unknown): Promise<Result> {
  return vendorJob(id, (clientId, jobId) => vendorJobs.deliver(clientId, jobId));
}

/** The signed-in vendor gives up work in progress: the held money goes back to the studio. */
export async function withdrawFromJob(id: unknown): Promise<Result> {
  return vendorJob(id, (clientId, jobId) => vendorJobs.withdraw(clientId, jobId));
}

async function vendorJob(id: unknown, work: (clientId: string, jobId: string) => Promise<void>): Promise<Result> {
  return runAction("vendors", async () => {
    const session = await getClientSession();
    if (!session) throw new VendorError("Sign in first.");
    await work(session.client_id, parseInput(jobIdSchema, id));
    revalidatePath("/vendors", "layout");
  });
}

// ── Jobs: the studio ──

/** A vendor a studio can hire, as the search shows them. */
export interface VendorCard {
  id: string;
  name: string;
  category: string;
  location: string | null;
  skills: string[];
  photoUrl: string | null;
}

/** Vendors the caller's studio can hire on its projects. */
export async function findVendors(input: unknown): Promise<Result<VendorCard[]>> {
  return runAction("vendors", async () => {
    await studioOfCaller("projects");
    const { query, category } = parseInput(vendorSearchSchema, input);
    const found = await vendors.search(query, category);
    return Promise.all(found.map(async (v: Vendor) => ({ id: v.id, name: v.name, category: v.category, location: v.location, skills: v.skills, photoUrl: await vendors.pictureUrl(v.photoKey) })));
  });
}

/**
 * The caller's studio asks a vendor to do work on one of its projects, in a
 * folder of the project's (an existing one, or one made for them now): the
 * only folder the vendor will see.
 */
export async function requestVendor(input: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const { studio, scope, session } = await studioOfCaller("projects");
    const { request, folder } = parseInput(jobRequestSchema, input);
    const projectFolder = await files.projectFolder(scope, request.projectId);
    if (!projectFolder) throw new VendorError("That project has no folder.");
    let folderId: string;
    if (folder.kind === "new") {
      folderId = await files.createFolder(scope, { parentId: projectFolder, name: folder.name });
    } else {
      const within = await files.foldersWithin(scope, projectFolder);
      if (!within.some((f) => f.id === folder.folderId)) throw new VendorError("Choose a folder inside this project's.");
      folderId = folder.folderId;
    }
    await vendorJobs.request({ tenantId: scope.tenantId, name: studio.name, actorName: session.name }, request, folderId);
    revalidatePath(`/studio/projects/${request.projectId}`);
  });
}

/** The caller's studio calls off a job before any money is held. */
export async function cancelVendorJob(id: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const { scope } = await studioOfCaller("projects");
    await vendorJobs.cancel(scope.tenantId, parseInput(jobIdSchema, id));
    revalidatePath("/studio/projects", "layout");
  });
}

/** The caller's studio pays a job in to Aming (approving the samples, if any): the work goes ahead. Money: the owner and the Money area. */
export async function fundVendorJob(id: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const { scope, session } = await studioOfCaller("money");
    await vendorJobs.fund(scope.tenantId, parseInput(jobIdSchema, id), { id: session.client_id, name: session.name });
    revalidatePath("/studio", "layout");
  });
}

/** The caller's studio approves delivered work: Aming releases the held money to the vendor. */
export async function approveVendorJob(id: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const { scope, session } = await studioOfCaller("money");
    await vendorJobs.approve(scope.tenantId, parseInput(jobIdSchema, id), { id: session.client_id, name: session.name });
    revalidatePath("/studio", "layout");
  });
}

/** The caller's studio raises a dispute over work in progress or delivered: Aming's staff settle it. */
export async function disputeVendorJob(id: unknown, reason: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const { scope } = await studioOfCaller("projects");
    await vendorJobs.studioDispute(scope.tenantId, parseInput(jobIdSchema, id), parseInput(disputeReasonSchema, reason));
    revalidatePath("/studio/projects", "layout");
  });
}

// ── Jobs: Aming's staff ──

/** Staff settle a disputed job: the money to the vendor, or back to the studio. The boss and supervisors. */
export async function settleVendorJob(id: unknown, outcome: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const staff = await getDashboardSession();
    if (!staff || !canViewAccounts(staff.role)) throw new VendorError("Only the boss or a supervisor can settle disputes.");
    await vendorJobs.settle(parseInput(jobIdSchema, id), parseInput(settlementSchema, outcome), { id: staff.userId, name: staff.fullName ?? staff.email ?? "Aming staff" });
    revalidatePath("/dashboard/vendor-jobs");
  });
}
