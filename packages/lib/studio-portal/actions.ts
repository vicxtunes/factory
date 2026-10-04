"use server";

// The browser's entry points to the studio portal.
//
// Client actions come in by the studio's slug, never a tenant id from the
// browser: sign in (phone + PIN), set the PIN from a set-up link, sign out.
// Studio actions get the studio from the owner's session: set the studio's
// address, make a client's set-up link.

import { revalidatePath } from "next/cache";

import { customerIdSchema } from "@repo/lib/customers/core";
import { customers } from "@repo/lib/customers/server";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { whatsappNumber } from "@repo/lib/kernel/core/phone";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import { INVITE_DAYS, inviteTokenSchema, pinSchema, signInSchema, slugSchema } from "./core";
import { PortalError } from "./ports";
import { clearPortalCookie, inviteUrl, portal, setPortalCookie, studioAtSlug } from "./server";

async function studioFor(slug: unknown) {
  const at = await studioAtSlug(parseInput(slugSchema, slug));
  if (!at) throw new PortalError("This studio's page doesn't exist.");
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

/** From a set-up link: the client chooses their PIN and is signed in. */
export async function portalSetPin(slug: unknown, token: unknown, pin: unknown): Promise<Result> {
  return runAction("studio-portal", async () => {
    const { studio } = await studioFor(slug);
    const session = await portal.acceptInvite(studio.id, parseInput(inviteTokenSchema, token), parseInput(pinSchema, pin));
    await setPortalCookie(session);
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
    const { scope } = await studioOfCaller();
    await portal.setSlug(scope, parseInput(slugSchema, slug));
    revalidatePath("/studio", "layout");
  });
}

/**
 * A set-up link for a client (first PIN, or a forgotten one), with a WhatsApp
 * link that sends it. The studio needs an address first.
 */
export async function createPortalInvite(customerId: unknown): Promise<Result<{ url: string; whatsapp: string }>> {
  return runAction("studio-portal", async () => {
    const { scope, studio } = await studioOfCaller();
    const slug = await portal.currentSlug(scope.tenantId);
    if (!slug) throw new PortalError("Choose your studio's address first, on Studio profile.");
    const id = parseInput(customerIdSchema, customerId);
    const token = await portal.invite(scope, id);
    const customer = await customers.get(scope, id);
    const url = inviteUrl(slug, token);
    const text = `Hello ${customer?.name ?? ""}, here is your page with ${studio.name}: your projects, bookings, invoices and photos. Open this link and choose a 4-digit PIN (it works for ${INVITE_DAYS} days): ${url}`;
    revalidatePath("/studio", "layout");
    return { url, whatsapp: `https://wa.me/${whatsappNumber(customer?.phone ?? null)}?text=${encodeURIComponent(text)}` };
  });
}
