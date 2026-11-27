"use server";

// The browser's entry points to ads (./server.ts). A business's ads: whoever
// manages its catalog (as for Social Media); starting one takes money from the
// owner's Aming card, so only the owner starts ads. The boss's setup: the boss alone.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { getDashboardSession } from "@repo/lib/auth/session";
import { amingCardBalance } from "@repo/lib/wallet/studio";
import { type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import { studioOfCaller } from "@repo/lib/studios/server";

import type { AdInterest, AdPlace, StudioAd } from "./core";
import * as ads from "./server";
import { AdsError, type AdAccountChoice, type NewAd } from "./server";

const PAGE = "/studio/social/ads";

async function business() {
  const c = await studioOfCaller("catalog");
  if (!(await ads.adsOn(c.studio.id))) throw new AdsError("Ads aren't open for your business yet.");
  return c;
}

export async function myAds(): Promise<Result<{ ads: StudioAd[]; canStart: boolean; balance: number | null; feePercent: number; minDaily: number; pageName: string | null }>> {
  return runAction("ads", async () => {
    const c = await business();
    const s = await ads.adsSettings();
    const owner = c.access.owner;
    return {
      ads: await ads.listAds(c.studio),
      canStart: owner,
      balance: owner ? await amingCardBalance(c.studio.ownerClientId) : null,
      feePercent: s.feePercent,
      minDaily: s.minDailyUgx,
      pageName: s.pageName,
    };
  });
}

export async function adPhotoChoices(): Promise<Result<Awaited<ReturnType<typeof ads.adPhotos>>>> {
  return runAction("ads", async () => ads.adPhotos((await business()).studio));
}

export async function adServices(): Promise<Result<{ slug: string; name: string }[]>> {
  return runAction("ads", async () => {
    const { offerings } = await import("@repo/lib/offerings/server");
    const c = await business();
    return (await offerings.showroom(c.scope, "service")).flatMap((cat) => cat.services.map((s) => ({ slug: s.slug, name: s.name })));
  });
}

export async function findPlaces(q: string): Promise<Result<AdPlace[]>> {
  return runAction("ads", async () => {
    await business();
    return ads.searchPlaces(String(q ?? ""));
  });
}

export async function findInterests(q: string): Promise<Result<AdInterest[]>> {
  return runAction("ads", async () => {
    await business();
    return ads.searchInterests(String(q ?? ""));
  });
}

export async function startAd(input: NewAd): Promise<Result<string>> {
  return runAction("ads", async () => {
    const c = await business();
    if (!c.access.owner) throw new AdsError("Only the owner starts ads: the money comes from their Aming card.");
    const id = await ads.startAd(c.studio, { id: c.session.client_id, name: c.session.name }, input);
    revalidatePath(PAGE);
    return id;
  });
}

export async function pauseAd(adId: string, paused: boolean): Promise<Result> {
  return runAction("ads", async () => {
    const c = await business();
    await ads.pauseAd(c.studio, adId, paused === true);
    revalidatePath(PAGE);
  });
}

export async function stopAd(adId: string): Promise<Result> {
  return runAction("ads", async () => {
    const c = await business();
    await ads.stopAd(c.studio, adId);
    revalidatePath(PAGE);
  });
}

// ── The boss ──────────────────────────────────────────────────────────────

async function boss() {
  const session = await getDashboardSession();
  if (!session?.isBoss) throw new AdsError("Only the boss can change these.");
  return session;
}

/** Zernio's sign-in for Aming's Facebook with ads; it comes back to the Studios page. */
export async function connectAmingAds(): Promise<Result<string>> {
  return runAction("ads", async () => {
    await boss();
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    return ads.adsConnectUrl(`${proto}://${host}/dashboard/studios?ads=connected`);
  });
}

export async function amingAdAccounts(): Promise<Result<AdAccountChoice[]>> {
  return runAction("ads", async () => {
    await boss();
    return ads.adAccountChoices();
  });
}

export async function chooseAdAccount(choice: { zernioAccountId: string; adAccountId: string }): Promise<Result> {
  return runAction("ads", async () => {
    await boss();
    await ads.pickAdAccount({ zernioAccountId: String(choice.zernioAccountId), adAccountId: String(choice.adAccountId) });
    revalidatePath("/dashboard/studios");
  });
}

export async function saveAdRules(input: { enabled: boolean; feePercent: number; minDailyUgx: number; autoStopUgx: number }): Promise<Result> {
  return runAction("ads", async () => {
    await boss();
    const fee = Number(input.feePercent);
    const min = Math.round(Number(input.minDailyUgx));
    const stop = Math.round(Number(input.autoStopUgx));
    if (!(fee >= 0 && fee <= 100)) throw new AdsError("The fee is a percent from 0 to 100.");
    if (!(min >= 1000)) throw new AdsError("The smallest daily budget is at least UGX 1,000.");
    if (!(stop >= 1000)) throw new AdsError("Enter when an ad with no messages stops (UGX).");
    await ads.saveAdRules({ enabled: input.enabled === true, feePercent: fee, minDailyUgx: min, autoStopUgx: stop });
    revalidatePath("/dashboard/studios");
  });
}
