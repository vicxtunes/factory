"use server";

// The browser's entry points to the studio portal.
//
// Client actions come in by the studio's slug, never a tenant id from the
// browser: open the page from the studio's link (no PIN), stay signed in,
// sign in with phone + PIN (clients who set one earlier), sign out.
// Studio actions get the studio from the owner's session: set the studio's
// address, make the link to a client's page.

import { revalidatePath } from "next/cache";

import { customerIdSchema } from "@repo/lib/customers/core";
import { customers } from "@repo/lib/customers/server";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { whatsappNumber } from "@repo/lib/kernel/core/phone";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioForSetup, studioOfCaller } from "@repo/lib/studios/server";

import { INVITE_DAYS, inviteTokenSchema, signInSchema, slugSchema } from "./core";
import { PortalError } from "./ports";
import { clearPortalCookie, inviteUrl, portal, renewPortalCookie, setPortalCookie, studioAtSlug } from "./server";

async function studioFor(slug: unknown) {
  const at = await studioAtSlug(parseInput(slugSchema, slug));
  if (!at) throw new PortalError("This business's page doesn't exist.");
  return at;
}

/** A studio's client signs in with their phone and PIN. */
export async function portalSignIn(slug: unknown, input: unknown): Promise<Result> {
  return runAction("studio-portal", async () => {
    const { studio } = await studioFor(slug);
    const { phone, pin } = parseInput(signInSchema, input);
    await setPortalCookie(await portal.signIn(studio.id, phone, pin));
  });
}

/** From the studio's link: this device is signed in to the client's page for good, no PIN. */
export async function portalOpenLink(slug: unknown, token: unknown): Promise<Result> {
  return runAction("studio-portal", async () => {
    const { studio } = await studioFor(slug);
    await setPortalCookie(await portal.openLink(studio.id, parseInput(inviteTokenSchema, token)));
  });
}

/** Keeps this device signed in at the studio (called on each visit). */
export async function portalStayIn(slug: unknown): Promise<Result> {
  return runAction("studio-portal", async () => {
    const { studio } = await studioFor(slug);
    await renewPortalCookie(studio.id);
  });
}

export async function portalSignOut(slug: unknown): Promise<Result> {
  return runAction("studio-portal", async () => {
    const { studio } = await studioFor(slug);
    await clearPortalCookie(studio.id);
  });
}

/** The studio owner sets their studio's address. The old one keeps redirecting. */
export async function setStudioSlug(slug: unknown): Promise<Result> {
  return runAction("studio-portal", async () => {
    const { scope } = await studioForSetup();
    await portal.setSlug(scope, parseInput(slugSchema, slug));
    revalidatePath("/studio", "layout");
  });
}

/**
 * The link to a client's page (it signs in the device that opens it, no
 * PIN), with a WhatsApp link that sends it. The studio needs an address first.
 */
export async function createPortalInvite(customerId: unknown): Promise<Result<{ url: string; whatsapp: string }>> {
  return runAction("studio-portal", async () => {
    const { scope, studio } = await studioOfCaller("clients");
    const slug = await portal.currentSlug(scope.tenantId);
    if (!slug) throw new PortalError("Choose your business's address first, on Business profile.");
    const id = parseInput(customerIdSchema, customerId);
    const token = await portal.invite(scope, id);
    const customer = await customers.get(scope, id);
    const url = inviteUrl(slug, token);
    const text = `Hello ${customer?.name ?? ""}, here is your page with ${studio.name}: your projects, bookings, invoices and photos. Open this link on your phone (it works once, for ${INVITE_DAYS} days) and you'll stay signed in: ${url}`;
    revalidatePath("/studio", "layout");
    return { url, whatsapp: `https://wa.me/${whatsappNumber(customer?.phone ?? null)}?text=${encodeURIComponent(text)}` };
  });
}
