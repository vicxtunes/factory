"use server";

// Vendor actions for the signed-in account.

import { revalidatePath } from "next/cache";

import { getClientSession, getDashboardSession } from "@repo/lib/auth/session";
import { files } from "@repo/lib/files/server";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";

import { studioOfCaller } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";
import { z } from "zod";

import {
  disputeReasonSchema,
  jobFolderSchema,
  jobAnswerSchema,
  jobIdSchema,
  jobRequestSchema,
  rentalRequestSchema,
  offerIdSchema,
  offerSchema,
  pictureKeySchema,
  settlementSchema,
  vendorJoinSchema,
  vendorPictureSchema,
  vendorProfileSchema,
  vendorSearchSchema,
  type JobFolder,
  type Vendor,
  type VendorOffer,
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

/** The signed-in vendor saves their profile (Edit profile on /vendors/profile). */
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

// ── Services, and samples of their work ──

/** The signed-in vendor adds a service (no id) or edits one of theirs; returns its id. */
export async function saveVendorOffer(id: unknown, input: unknown): Promise<Result<{ id: string }>> {
  return runAction("vendors", async () => {
    const clientId = await vendorCaller();
    const offer = parseInput(offerSchema, input);
    let saved: string;
    if (id === null) saved = (await vendors.addOffer(clientId, offer)).id;
    else await vendors.editOffer(clientId, (saved = parseInput(offerIdSchema, id)), offer);
    revalidatePath("/vendors", "layout");
    return { id: saved };
  });
}

/** The signed-in vendor deletes one of their services, with its samples. */
export async function deleteVendorOffer(id: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    await vendors.removeOffer(await vendorCaller(), parseInput(offerIdSchema, id));
    revalidatePath("/vendors", "layout");
  });
}

/** A signed link to upload a sample of one of the signed-in vendor's services to (already shrunk in the browser). */
export async function startVendorSampleUpload(offerId: unknown): Promise<Result<{ key: string; url: string }>> {
  return runAction("vendors", async () => vendors.startSampleUpload(await vendorCaller(), parseInput(offerIdSchema, offerId)));
}

/** Adds the uploaded picture to the service's samples. */
export async function confirmVendorSample(offerId: unknown, key: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    await vendors.confirmSample(await vendorCaller(), parseInput(offerIdSchema, offerId), parseInput(pictureKeySchema, key));
    revalidatePath("/vendors", "layout");
  });
}

export async function deleteVendorSample(id: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    await vendors.removeSample(await vendorCaller(), parseInput(z.uuid("That sample is gone already."), id));
    revalidatePath("/vendors", "layout");
  });
}

async function vendorCaller(): Promise<string> {
  const session = await getClientSession();
  if (!session) throw new VendorError("Sign in first.");
  return session.client_id;
}

// ── Jobs: the vendor ──

/** The signed-in vendor declines a job request, or accepts it committing to deliver by a day. */
export async function respondToJob(id: unknown, answer: unknown): Promise<Result> {
  // Today in Kampala, where the vendors are: a day before it can't be promised.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  return vendorJob(id, (clientId, jobId) => vendorJobs.respond(clientId, jobId, parseInput(jobAnswerSchema, answer), today));
}

/** The signed-in vendor's samples are in the job's folder. */
export async function sendSamples(id: unknown): Promise<Result> {
  return vendorJob(id, (clientId, jobId) => vendorJobs.sendSamples(clientId, jobId));
}

/** The signed-in vendor handed hired equipment over to the studio. */
export async function handOverJob(id: unknown): Promise<Result> {
  return vendorJob(id, (clientId, jobId) => vendorJobs.handOver(clientId, jobId));
}

/** The signed-in vendor says the work is done, in the job's folder (or, hired equipment, that it came back). */
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
  /** Their priced services, to hire at one. */
  offers: Pick<VendorOffer, "id" | "name" | "price" | "unit">[];
  photoUrl: string | null;
}

/** Vendors the caller's studio can hire on its projects. */
export async function findVendors(input: unknown): Promise<Result<VendorCard[]>> {
  return runAction("vendors", async () => {
    await studioOfCaller("projects");
    const { query, category } = parseInput(vendorSearchSchema, input);
    const found = await vendors.search(query, category);
    return Promise.all(found.map(async (v: Vendor) => ({ id: v.id, name: v.name, category: v.category, location: v.location, skills: v.skills, offers: v.offers.map(({ id, name, price, unit }) => ({ id, name, price, unit })), photoUrl: await vendors.pictureUrl(v.photoKey) })));
  });
}

/**
 * The caller's studio asks a vendor to do work, on one of its projects (in a
 * folder of the project's) or on none (in a folder of its own in Drive →
 * Jobs): an existing folder or one made for them now, the only one they see.
 */
export async function requestVendor(input: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const { studio, scope, session } = await studioOfCaller("projects");
    const { request, folder } = parseInput(jobRequestSchema, input);
    const folderId = await folderFor(scope, request.projectId, folder);
    await vendorJobs.request({ tenantId: scope.tenantId, name: studio.name, actorName: session.name }, request, folderId);
    revalidatePath("/studio", "layout");
  });
}

/** The caller's studio hires equipment from a vendor: an item, how many, and the days; priced at the vendor's rate. */
export async function requestRental(input: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const { studio, scope, session } = await studioOfCaller("projects");
    await vendorJobs.requestRental({ tenantId: scope.tenantId, name: studio.name, actorName: session.name }, parseInput(rentalRequestSchema, input));
    revalidatePath("/studio", "layout");
  });
}

/** The caller's studio gives an open job the folder its vendor works in (one made before jobs had folders, or whose folder was deleted). */
export async function setVendorJobFolder(id: unknown, folder: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const { scope } = await studioOfCaller("projects");
    const chosen = parseInput(jobFolderSchema, folder);
    await vendorJobs.setFolder(scope.tenantId, parseInput(jobIdSchema, id), (projectId) => folderFor(scope, projectId, chosen));
    revalidatePath("/studio", "layout");
  });
}

/**
 * The folder chosen for a job: inside the project's, or (no project) inside
 * Drive → Jobs; an existing one there, or a new one made now.
 */
async function folderFor(scope: TenantScope, projectId: string | null, folder: JobFolder): Promise<string> {
  const parent = projectId ? await files.projectFolder(scope, projectId) : await files.jobsFolder(scope);
  if (!parent) throw new VendorError("That project has no folder.");
  if (folder.kind === "new") return files.createFolder(scope, { parentId: parent, name: folder.name });
  const within = await files.foldersWithin(scope, parent);
  if (!within.some((f) => f.id === folder.folderId)) throw new VendorError(projectId ? "Choose a folder inside this project's." : "Choose a folder inside Jobs.");
  return folder.folderId;
}

/** The caller's studio calls off a job before any money is held. */
export async function cancelVendorJob(id: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const { scope } = await studioOfCaller("projects");
    await vendorJobs.cancel(scope.tenantId, parseInput(jobIdSchema, id));
    revalidatePath("/studio", "layout");
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
    revalidatePath("/studio", "layout");
  });
}

// ── Jobs: Aming's staff ──

/** Staff settle a disputed job: the money to the vendor, or back to the studio. The boss only. */
export async function settleVendorJob(id: unknown, outcome: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const staff = await getDashboardSession();
    if (staff?.role !== "boss") throw new VendorError("Only the boss can settle disputes.");
    await vendorJobs.settle(parseInput(jobIdSchema, id), parseInput(settlementSchema, outcome), { id: staff.userId, name: staff.fullName ?? staff.email ?? "Aming staff" });
    revalidatePath("/dashboard/vendor-jobs");
  });
}
