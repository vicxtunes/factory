"use server";

// Vendor actions for the signed-in account.

import { revalidatePath } from "next/cache";

import { getClientSession } from "@repo/lib/auth/session";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";

import { studioOfCaller } from "@repo/lib/studios/server";
import { z } from "zod";

import { jobIdSchema, jobRequestSchema, pictureKeySchema, vendorJoinSchema, vendorPictureSchema, vendorProfileSchema, vendorSearchSchema, type Vendor } from "./core";
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
  return runAction("vendors", async () => {
    const session = await getClientSession();
    if (!session) throw new VendorError("Sign in first.");
    await vendorJobs.respond(session.client_id, parseInput(jobIdSchema, id), parseInput(z.boolean(), accept));
    revalidatePath("/vendors", "layout");
  });
}

/** The signed-in vendor says the work is done, in the project's folder. */
export async function deliverJob(id: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const session = await getClientSession();
    if (!session) throw new VendorError("Sign in first.");
    await vendorJobs.deliver(session.client_id, parseInput(jobIdSchema, id));
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

/** The caller's studio asks a vendor to do work on one of its projects. */
export async function requestVendor(input: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const { studio, scope, session } = await studioOfCaller("projects");
    const request = parseInput(jobRequestSchema, input);
    await vendorJobs.request({ tenantId: scope.tenantId, name: studio.name, actorName: session.name }, request);
    revalidatePath(`/studio/projects/${request.projectId}`);
  });
}

/** The caller's studio calls off a job the vendor hasn't delivered. */
export async function cancelVendorJob(id: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const { scope } = await studioOfCaller("projects");
    await vendorJobs.cancel(scope.tenantId, parseInput(jobIdSchema, id));
    revalidatePath("/studio/projects", "layout");
  });
}

/** The caller's studio approves delivered work and pays it from its Business card (money is the owner's and the Money area's). */
export async function payVendorJob(id: unknown): Promise<Result> {
  return runAction("vendors", async () => {
    const { scope, session } = await studioOfCaller("money");
    await vendorJobs.pay(scope.tenantId, parseInput(jobIdSchema, id), { id: session.client_id, name: session.name });
    revalidatePath("/studio", "layout");
  });
}
