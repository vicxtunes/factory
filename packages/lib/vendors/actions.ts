"use server";

// Vendor actions for the signed-in account.

import { revalidatePath } from "next/cache";

import { getClientSession } from "@repo/lib/auth/session";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";

import { pictureKeySchema, vendorJoinSchema, vendorPictureSchema, vendorProfileSchema } from "./core";
import { VendorError } from "./ports";
import { vendors } from "./server";

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
