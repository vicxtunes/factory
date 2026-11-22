"use server";

// The browser's entry points to Pro. Paying and renewing: the business's
// owner (it's their Aming card). Choosing the page's look: the owner, or a
// team member with Packages & showroom. The price: the boss alone.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDashboardSession } from "@repo/lib/auth/session";
import { parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import { buyProSchema, domainSchema, SERVER_IP, isPro, mayUse, ProError, proPageSchema, proPriceSchema, templateSchema } from "./core";
import { askDomain, buyPro, dropDomain, proStatus, setAutoRenew, setDomainLive, setPageTemplate, setProPage, setProPrice } from "./server";

const touched = () => revalidatePath("/studio/pro");

/** A month of Pro from the owner's card, at the price they saw. */
export async function payForPro(input: unknown): Promise<Result<string>> {
  return runAction("pro", async () => {
    const { scope, session } = await studioOfCaller();
    const { amount, autoRenew } = parseInput(buyProSchema, input);
    const until = await buyPro(scope.tenantId, amount, { auto: false, renew: autoRenew, actorId: session.client_id, actorName: session.name });
    touched();
    return until;
  });
}

export async function changeProAutoRenew(on: unknown): Promise<Result> {
  return runAction("pro", async () => {
    const { scope } = await studioOfCaller();
    await setAutoRenew(scope.tenantId, on === true);
    touched();
  });
}

/** Show this look on the public page; a Pro look needs Pro. */
export async function choosePageTemplate(template: unknown): Promise<Result> {
  return runAction("pro", async () => {
    const { scope } = await studioOfCaller("catalog");
    const id = parseInput(templateSchema, template);
    if (!mayUse(await proStatus(scope.tenantId), id)) throw new ProError("That look is for Pro. Get Pro first.");
    await setPageTemplate(scope.tenantId, id);
    touched();
    revalidatePath("/[slug]", "page");
  });
}

/** Only the boss sets Pro's monthly price; none takes Pro off sale. */
export async function setProMonthlyPrice(price: unknown): Promise<Result> {
  return runAction("pro", async () => {
    const session = await getDashboardSession();
    if (!session?.isBoss) throw new ProError("Only the boss can set Pro's price.");
    await setProPrice(parseInput(proPriceSchema, price));
    revalidatePath("/dashboard/studios");
  });
}

/** Only the boss edits the pricing page's words. (The page is read fresh on each visit.) */
export async function saveProPage(input: unknown): Promise<Result> {
  return runAction("pro", async () => {
    const session = await getDashboardSession();
    if (!session?.isBoss) throw new ProError("Only the boss can change the pricing page.");
    await setProPage(parseInput(proPageSchema, input));
    revalidatePath("/dashboard/studios");
  });
}

/** The owner asks for their own domain (Pro). Aming connects it. */
export async function requestDomain(domain: unknown): Promise<Result> {
  return runAction("pro", async () => {
    const { scope, studio } = await studioOfCaller();
    if (!isPro(await proStatus(scope.tenantId))) throw new ProError("Your own domain comes with Pro. Get Pro first.");
    const name = parseInput(domainSchema, domain);
    await askDomain(scope.tenantId, name);
    touched();
    // The boss connects it (dashboard → Studios → Own domains). Best effort.
    try {
      const [{ bosses }, { notifyActor }] = await Promise.all([import("@repo/lib/staff-access/server"), import("@repo/lib/push/send")]);
      const note = { title: "A business wants its own domain", body: `${studio.name}: ${name}`, url: "/dashboard/studios" };
      await Promise.all((await bosses()).map((id) => notifyActor({ type: "dashboard_user", id }, note)));
    } catch (err) {
      console.error("pro: telling the boss about a domain failed:", err);
    }
  });
}

export async function removeDomain(): Promise<Result> {
  return runAction("pro", async () => {
    const { scope } = await studioOfCaller();
    await dropDomain(scope.tenantId);
    touched();
  });
}

/** The boss: a domain is connected on the server (live), or taken off. */
export async function markDomainLive(tenantId: unknown, live: unknown): Promise<Result> {
  return runAction("pro", async () => {
    const session = await getDashboardSession();
    if (!session?.isBoss) throw new ProError("Only the boss can connect domains.");
    await setDomainLive(parseInput(z.uuid(), tenantId), live === true);
    revalidatePath("/dashboard/studios");
  });
}

/** Whether the owner's domain already points at Aming (they added the record). */
export async function checkDomainDns(): Promise<Result<{ pointsHere: boolean; found: string[] }>> {
  return runAction("pro", async () => {
    const { scope } = await studioOfCaller();
    const { domain } = await proStatus(scope.tenantId);
    if (!domain) throw new ProError("Ask for your domain first.");
    const { resolve4 } = await import("node:dns/promises");
    const found = await resolve4(domain.name).catch(() => [] as string[]);
    return { pointsHere: found.includes(SERVER_IP), found };
  });
}

/** The photos at the top of the business's page, in order (none: picked by themselves). Catalog managers. */
export async function chooseHeroPhotos(ids: unknown): Promise<Result> {
  return runAction("pro", async () => {
    const { scope } = await studioOfCaller("catalog");
    const { setHeroChoice, MAX_HERO_PHOTOS } = await import("./hero");
    const chosen = parseInput(z.array(z.uuid("Choose photos from your albums.")).max(MAX_HERO_PHOTOS, `Choose up to ${MAX_HERO_PHOTOS} photos.`), ids);
    await setHeroChoice(scope.tenantId, chosen);
    touched();
    revalidatePath("/[slug]", "page");
  });
}
