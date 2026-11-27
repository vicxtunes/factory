import "server-only";

// Ads for businesses (./core.ts): run from Aming's own Facebook / Instagram
// Page and Meta ad account, through Zernio's Ads API (docs.zernio.com/platforms/meta-ads,
// read 2026-11-28). The boss connects Aming's Page and picks the ad account
// once (Dashboard → Studios → Ads); a business on Social Media starts ads from
// My Business → Social Media → Ads. The ad leads to the business's Aming page
// (?via=ad&ad=<id>), where "Message us" makes the visitor its lead.
// Table: supabase/migrations/20270201100000_studio_ads.sql.

import { clientUrl } from "@repo/lib/client-portal/paths";
import { AppError } from "@repo/lib/kernel/core";
import { messagesOn } from "@repo/lib/business-messages/server";
import { offerings } from "@repo/lib/offerings/server";
import { photos } from "@repo/lib/photos/server";
import { tell } from "@repo/lib/pro/server";
import { socialOn } from "@repo/lib/social/server";
import { call, zernioReady } from "@repo/lib/social/zernio";
import { portal } from "@repo/lib/studio-portal/server";
import { studioScope, type Studio } from "@repo/lib/studios/core";
import { studios } from "@repo/lib/studios/server";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { adPrice, adRefund, fromShillings, isLive, shouldAutoStop, toShillings, type AdInterest, type AdPlace, type AdStatus, type StudioAd } from "./core";

const db = () => createAdminClient();

/** A refusal whose words can be shown. */
export class AdsError extends AppError {}

const AMING_PROFILE = "aming-ads";
/** A finished ad's money is settled this long after, once Meta's last spend is in. */
const SETTLE_AFTER_MS = 6 * 3_600_000;
/** Meta's smallest radius around a town (km). */
const RADIUS_KM = 25;

// ── The boss's setup ──────────────────────────────────────────────────────

export interface AdsSettings {
  enabled: boolean;
  zernioProfileId: string | null;
  zernioAccountId: string | null;
  pageName: string | null;
  adAccountId: string | null;
  adAccountName: string | null;
  currency: string | null;
  feePercent: number;
  minDailyUgx: number;
  autoStopUgx: number;
}

export async function adsSettings(): Promise<AdsSettings> {
  const { data, error } = await db().from("ads_settings").select("*").single();
  if (error) throw new Error(`ads: settings: ${error.message}`);
  return {
    enabled: data.enabled,
    zernioProfileId: data.zernio_profile_id,
    zernioAccountId: data.zernio_account_id,
    pageName: data.page_name,
    adAccountId: data.ad_account_id,
    adAccountName: data.ad_account_name,
    currency: data.currency,
    feePercent: Number(data.fee_percent),
    minDailyUgx: Number(data.min_daily_ugx),
    autoStopUgx: Number(data.auto_stop_ugx),
  };
}

async function saveSettings(patch: Record<string, unknown>): Promise<void> {
  const { error } = await db().from("ads_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) throw new Error(`ads: settings: ${error.message}`);
}

export async function saveAdRules(s: { enabled: boolean; feePercent: number; minDailyUgx: number; autoStopUgx: number }): Promise<void> {
  const current = await adsSettings();
  if (s.enabled && !current.adAccountId) throw new AdsError("Connect Aming's Facebook and pick the ad account first.");
  await saveSettings({ enabled: s.enabled, fee_percent: s.feePercent, min_daily_ugx: s.minDailyUgx, auto_stop_ugx: s.autoStopUgx });
}

/** Zernio's sign-in for Aming's own Facebook with ads (the boss, once). */
export async function adsConnectUrl(back: string): Promise<string> {
  let { zernioProfileId } = await adsSettings();
  if (!zernioProfileId) {
    try {
      const r = await call<{ profile: { _id: string } }>("POST", "/profiles", { name: "Aming ads", externalId: AMING_PROFILE, timezone: "Africa/Kampala" }, { "Idempotency-Key": "profile-aming-ads" });
      zernioProfileId = r.profile._id;
    } catch (err) {
      zernioProfileId = (err as { data?: { details?: { existingProfileId?: string } } }).data?.details?.existingProfileId ?? null;
      if (!zernioProfileId) throw err;
    }
    await saveSettings({ zernio_profile_id: zernioProfileId });
  }
  const q = new URLSearchParams({ profileId: zernioProfileId, redirect_url: back });
  const r = await call<{ authUrl: string }>("GET", `/connect/facebook/ads?${q}`);
  return r.authUrl;
}

export interface AdAccountChoice {
  zernioAccountId: string;
  pageName: string;
  adAccountId: string;
  name: string;
  currency: string;
  usable: boolean;
  why: string | null;
}

/** The ad accounts reachable through Aming's connected Facebook. */
export async function adAccountChoices(): Promise<AdAccountChoice[]> {
  const { zernioProfileId } = await adsSettings();
  if (!zernioProfileId) return [];
  const { accounts } = await call<{ accounts: { _id: string; platform: string; displayName?: string; username?: string }[] }>("GET", `/accounts?profileId=${encodeURIComponent(zernioProfileId)}&limit=50`);
  const out: AdAccountChoice[] = [];
  for (const a of (accounts ?? []).filter((x) => x.platform === "facebook" || x.platform === "metaads")) {
    try {
      const r = await call<{ accounts: { id: string; name: string; currency: string; selectable?: boolean; unusableReason?: string | null }[] }>("GET", `/ads/accounts?accountId=${encodeURIComponent(a._id)}`);
      for (const acc of r.accounts ?? []) {
        out.push({ zernioAccountId: a._id, pageName: a.displayName ?? a.username ?? "Facebook", adAccountId: acc.id, name: acc.name, currency: acc.currency, usable: acc.selectable !== false, why: acc.unusableReason ?? null });
      }
    } catch (err) {
      console.error("ads: listing ad accounts failed:", a._id, err);
    }
  }
  return out;
}

export async function pickAdAccount(choice: { zernioAccountId: string; adAccountId: string }): Promise<void> {
  const found = (await adAccountChoices()).find((c) => c.zernioAccountId === choice.zernioAccountId && c.adAccountId === choice.adAccountId);
  if (!found) throw new AdsError("That ad account isn't reachable. Connect again.");
  if (!found.usable) throw new AdsError(`Meta won't run ads from it: ${found.why ?? "check it in Ads Manager"}.`);
  await saveSettings({ zernio_account_id: found.zernioAccountId, page_name: found.pageName, ad_account_id: found.adAccountId, ad_account_name: found.name, currency: found.currency });
}

/** Ads across all businesses this month, for the boss. */
export async function adsSummary(): Promise<{ running: number; thisMonth: number; spend: number; fees: number }> {
  const monthStart = new Date(new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 8) + "01T00:00:00+03:00").toISOString();
  const { data } = await db().from("studio_ads").select("status, spend, fee, budget, created_at").gte("created_at", monthStart).returns<{ status: AdStatus; spend: number; fee: number; budget: number }[]>();
  const rows = data ?? [];
  return {
    running: rows.filter((r) => r.status === "running").length,
    thisMonth: rows.length,
    spend: rows.reduce((s, r) => s + Number(r.spend), 0),
    fees: rows.reduce((s, r) => s + (r.budget > 0 ? Math.round((Number(r.fee) * Math.min(Number(r.spend), Number(r.budget))) / Number(r.budget)) : 0), 0),
  };
}

// ── A business's ads ──────────────────────────────────────────────────────

/** Whether this business can run ads: it has Social Media and Messages (its ads' visitors write to it there), and the boss switched ads on. */
export async function adsOn(tenantId: string): Promise<boolean> {
  if (!zernioReady() || !(await socialOn(tenantId)) || !(await messagesOn(tenantId))) return false;
  const s = await adsSettings();
  return s.enabled && !!s.adAccountId && !!s.zernioAccountId;
}

async function ugxPerUsd(): Promise<number> {
  const { data } = await db().from("assistant_settings").select("ugx_per_usd").single<{ ugx_per_usd: number }>();
  return Number(data?.ugx_per_usd ?? 3700);
}

/** Towns (Meta's keys) for "Who sees it". */
export async function searchPlaces(q: string): Promise<AdPlace[]> {
  const s = await adsSettings();
  if (!s.zernioAccountId || q.trim().length < 2) return [];
  const p = new URLSearchParams({ accountId: s.zernioAccountId, q: q.trim().slice(0, 60), dimension: "geo", geoType: "city", countryCode: "UG" });
  const r = await call<{ results: { id: string; name: string; path?: string[] }[] }>("GET", `/ads/targeting/search?${p}`);
  return (r.results ?? []).slice(0, 10).map((x) => ({ key: x.id, name: x.path?.length ? x.path.join(", ") : x.name }));
}

/** Interests (Meta's) for "Who sees it": weddings, parenting… */
export async function searchInterests(q: string): Promise<AdInterest[]> {
  const s = await adsSettings();
  if (!s.zernioAccountId || q.trim().length < 2) return [];
  const p = new URLSearchParams({ accountId: s.zernioAccountId, q: q.trim().slice(0, 60), dimension: "interest" });
  const r = await call<{ results: { id: string; name: string }[] }>("GET", `/ads/targeting/search?${p}`);
  return (r.results ?? []).slice(0, 10).map((x) => ({ id: String(x.id), name: x.name }));
}

/** Photos the business may advertise with: its public albums and its services' galleries. */
export async function adPhotos(studio: Studio): Promise<{ albumId: string; title: string; photos: { id: string; thumbUrl: string }[] }[]> {
  const scope = studioScope(studio);
  const services = (await offerings.showroom(scope, "service")).flatMap((c) => c.services);
  const galleries = (await Promise.all(services.slice(0, 20).map((s) => photos.serviceGallery(scope, s.id)))).filter((a): a is NonNullable<typeof a> => !!a);
  const albums = [...galleries, ...(await photos.albums(scope, true)).slice(0, 10)];
  const out = [];
  for (const a of albums) {
    const list = await photos.photos(scope, a.id);
    if (list.length) out.push({ albumId: a.id, title: a.title, photos: list.slice(0, 24).map((p) => ({ id: p.id, thumbUrl: p.thumbUrl })) });
  }
  return out;
}

export interface NewAd {
  serviceSlug: string | null;
  title: string;
  body: string;
  albumId: string;
  photoId: string;
  places: AdPlace[];
  ageMin: number;
  ageMax: number;
  gender: "all" | "male" | "female";
  interests: AdInterest[];
  dailyBudget: number;
  days: number;
}

/** What starting this ad costs, for the form. */
export async function quote(dailyBudget: number, days: number): Promise<{ budget: number; fee: number; total: number; feePercent: number; minDaily: number }> {
  const s = await adsSettings();
  return { ...adPrice(dailyBudget, days, s.feePercent), feePercent: s.feePercent, minDaily: s.minDailyUgx };
}

/**
 * Starts an ad: the money comes off the owner's Aming card first, then the ad
 * goes to Meta (through Zernio). If Meta refuses it, the money goes back.
 */
export async function startAd(studio: Studio, actor: { id: string; name: string }, input: NewAd): Promise<string> {
  if (!(await adsOn(studio.id))) throw new AdsError("Ads aren't open for your business yet.");
  const s = await adsSettings();
  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 1000);
  if (!title || !body) throw new AdsError("Write the ad's headline and text.");
  if (!input.places.length) throw new AdsError("Pick at least one town.");
  if (input.ageMin < 13 || input.ageMax > 65 || input.ageMin > input.ageMax) throw new AdsError("Check the ages (13 to 65).");
  const daily = Math.round(Number(input.dailyBudget));
  const days = Math.round(Number(input.days));
  if (!(daily >= s.minDailyUgx)) throw new AdsError(`The smallest daily budget is UGX ${s.minDailyUgx.toLocaleString("en-UG")}.`);
  if (!(days >= 1 && days <= 60)) throw new AdsError("Run it for 1 to 60 days.");
  const scope = studioScope(studio);
  const photo = (await photos.photos(scope, input.albumId)).find((p) => p.id === input.photoId);
  if (!photo) throw new AdsError("Pick one of your photos.");
  if (input.serviceSlug && !(await offerings.publicService(scope, input.serviceSlug, "service"))) throw new AdsError("That service isn't on your page any more.");
  const slug = await portal.currentSlug(studio.id);
  if (!slug) throw new AdsError("Your business has no page address yet.");

  const price = adPrice(daily, days, s.feePercent);
  const startsAt = new Date(Date.now() + 10 * 60_000);
  const endsAt = new Date(startsAt.getTime() + days * 86_400_000);
  const { data: row, error } = await db()
    .from("studio_ads")
    .insert({
      tenant_id: studio.id,
      service_slug: input.serviceSlug,
      title,
      body,
      album_id: input.albumId,
      photo_id: input.photoId,
      places: input.places.slice(0, 10),
      age_min: input.ageMin,
      age_max: input.ageMax,
      gender: input.gender,
      interests: input.interests.slice(0, 10),
      daily_budget: daily,
      days,
      budget: price.budget,
      fee: price.fee,
      charged: price.total,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      created_by: actor.id,
      created_by_name: actor.name,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !row) throw new Error(`ads: couldn't save: ${error?.message}`);

  const { error: payError } = await db().rpc("studio_ad_charge", { p_tenant: studio.id, p_amount: price.total, p_note: `Ad: ${title}`, p_actor_id: actor.id, p_actor_name: actor.name });
  if (payError) {
    await db().from("studio_ads").delete().eq("id", row.id);
    if (payError.message.includes("WALLET:insufficient_funds")) throw new AdsError(`There isn't UGX ${price.total.toLocaleString("en-UG")} on your Aming card. Add money with MTN or Airtel, then start the ad.`);
    throw new Error(`ads: charge: ${payError.message}`);
  }

  const link = clientUrl(`/${slug}${input.serviceSlug ? `/s/${input.serviceSlug}` : ""}?via=ad&ad=${row.id}`);
  try {
    const rate = await ugxPerUsd();
    const r = await call<{ ad: { _id: string; platformCampaignId?: string; reviewStatus?: string } }>(
      "POST",
      "/ads/create",
      {
        accountId: s.zernioAccountId,
        adAccountId: s.adAccountId,
        name: `${studio.name} · ${title}`.slice(0, 200),
        goal: "traffic",
        budgetAmount: fromShillings(price.budget, s.currency, rate),
        budgetType: "lifetime",
        startDate: startsAt.toISOString(),
        endDate: endsAt.toISOString(),
        headline: title,
        body,
        imageUrl: photo.largeUrl,
        callToAction: "LEARN_MORE",
        linkUrl: link,
        cities: input.places.slice(0, 10).map((p) => ({ key: p.key, radius: RADIUS_KM, distance_unit: "kilometer" })),
        ageMin: input.ageMin,
        ageMax: input.ageMax,
        gender: input.gender,
        ...(input.interests.length ? { interests: input.interests.slice(0, 10) } : {}),
        status: "ACTIVE",
      },
      { "Idempotency-Key": `ad-${row.id}` },
    );
    await db().from("studio_ads").update({ status: "in_review", zernio_ad_id: r.ad._id, campaign_id: r.ad.platformCampaignId ?? null }).eq("id", row.id);
    return row.id;
  } catch (err) {
    console.error("ads: Meta refused the ad:", row.id, err);
    await db().from("studio_ads").update({ status: "failed", stop_reason: err instanceof Error ? err.message.slice(0, 300) : "Meta refused it" }).eq("id", row.id);
    await db().rpc("studio_ad_refund", { p_ad: row.id, p_amount: price.total });
    throw new AdsError(`Meta didn't take the ad${err instanceof Error && !(err.message.startsWith("Zernio")) ? `: ${err.message}` : ""}. Your money is back on your Aming card.`);
  }
}

type AdRow = {
  id: string;
  tenant_id: string;
  service_slug: string | null;
  title: string;
  body: string;
  album_id: string | null;
  photo_id: string | null;
  places: AdPlace[];
  age_min: number;
  age_max: number;
  gender: "all" | "male" | "female";
  interests: AdInterest[];
  daily_budget: number;
  days: number;
  budget: number;
  fee: number;
  charged: number;
  starts_at: string;
  ends_at: string;
  status: AdStatus;
  stop_reason: string | null;
  zernio_ad_id: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  refunded: number | null;
  finished_at: string | null;
  settled_at: string | null;
  created_at: string;
};

/** The business's ads, newest first, with the leads each brought. */
export async function listAds(studio: Studio): Promise<StudioAd[]> {
  const { data, error } = await db().from("studio_ads").select("*").eq("tenant_id", studio.id).order("created_at", { ascending: false }).limit(100).returns<AdRow[]>();
  if (error) throw new Error(`ads: ${error.message}`);
  if (!data.length) return [];
  const scope = studioScope(studio);
  const albumIds = [...new Set(data.flatMap((a) => (a.album_id ? [a.album_id] : [])))];
  const urls = new Map<string, string>();
  for (const albumId of albumIds) {
    try {
      for (const p of await photos.photos(scope, albumId)) urls.set(p.id, p.thumbUrl);
    } catch {
      /* a removed album: no picture */
    }
  }
  const results = await leadResults(studio.id, data.map((a) => a.id));
  return data.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    serviceSlug: a.service_slug,
    photoUrl: a.photo_id ? (urls.get(a.photo_id) ?? null) : null,
    places: a.places,
    ageMin: a.age_min,
    ageMax: a.age_max,
    gender: a.gender,
    interests: a.interests,
    dailyBudget: Number(a.daily_budget),
    days: a.days,
    budget: Number(a.budget),
    fee: Number(a.fee),
    charged: Number(a.charged),
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    status: a.status,
    stopReason: a.stop_reason,
    spend: Number(a.spend),
    impressions: Number(a.impressions),
    reach: Number(a.reach),
    clicks: Number(a.clicks),
    refunded: a.refunded === null ? null : Number(a.refunded),
    ...(results.get(a.id) ?? { leads: 0, booked: 0, paid: 0 }),
    createdAt: a.created_at,
  }));
}

/** Leads each ad brought, and how many of them booked and paid (packages/lib/business-messages/leads.ts). */
async function leadResults(tenantId: string, adIds: string[]): Promise<Map<string, { leads: number; booked: number; paid: number }>> {
  const { data } = await db().from("business_leads").select("id, ad_ref").eq("tenant_id", tenantId).eq("source", "ad").in("ad_ref", adIds).returns<{ id: string; ad_ref: string }[]>();
  const out = new Map<string, { leads: number; booked: number; paid: number }>();
  if (!data?.length) return out;
  const { leadProgress } = await import("@repo/lib/business-messages/leads");
  const progress = await leadProgress(tenantId, data.map((l) => l.id));
  for (const l of data) {
    const r = out.get(l.ad_ref) ?? { leads: 0, booked: 0, paid: 0 };
    r.leads += 1;
    const st = progress.get(l.id);
    if (st === "booked" || st === "paid") r.booked += 1;
    if (st === "paid") r.paid += 1;
    out.set(l.ad_ref, r);
  }
  return out;
}

async function adOf(studio: Studio, adId: unknown): Promise<AdRow> {
  if (typeof adId !== "string" || !/^[0-9a-f-]{36}$/.test(adId)) throw new AdsError("That ad isn't here.");
  const { data } = await db().from("studio_ads").select("*").eq("id", adId).eq("tenant_id", studio.id).maybeSingle<AdRow>();
  if (!data) throw new AdsError("That ad isn't here.");
  return data;
}

async function setMetaStatus(zernioAdId: string, status: "paused" | "active"): Promise<void> {
  await call("PUT", `/ads/${encodeURIComponent(zernioAdId)}/status`, { status, platform: "facebook" });
}

export async function pauseAd(studio: Studio, adId: unknown, paused: boolean): Promise<void> {
  const ad = await adOf(studio, adId);
  if (!ad.zernio_ad_id || !(paused ? ["running", "in_review"] : ["paused"]).includes(ad.status)) throw new AdsError(paused ? "Only a running ad can be paused." : "Only a paused ad can go on.");
  if (!paused && new Date(ad.ends_at).getTime() <= Date.now()) throw new AdsError("Its days are over.");
  await setMetaStatus(ad.zernio_ad_id, paused ? "paused" : "active");
  await db().from("studio_ads").update({ status: paused ? "paused" : "running" }).eq("id", ad.id);
}

/** Stops it for good: Meta stops showing it, and the unspent money goes back once its last spend is read. */
export async function stopAd(studio: Studio, adId: unknown): Promise<void> {
  const ad = await adOf(studio, adId);
  if (!isLive(ad.status)) throw new AdsError("It isn't running.");
  if (ad.zernio_ad_id) await setMetaStatus(ad.zernio_ad_id, "paused");
  await db().from("studio_ads").update({ status: "stopped", stop_reason: "Stopped by the business" }).eq("id", ad.id);
}

// ── Every few minutes ─────────────────────────────────────────────────────

type ZAd = { status?: string; reviewStatus?: string | null; metrics?: { spend?: number | string; impressions?: number | string; reach?: number | string; clicks?: number | string } };

/** Meta's state of the ad, in our words. */
function stateOf(z: ZAd, ours: AdStatus): AdStatus {
  if (z.reviewStatus === "rejected" || z.status === "rejected") return "rejected";
  if (ours === "paused" || ours === "stopped") return ours;
  if (z.status === "completed" || z.status === "cancelled") return "ended";
  if (z.status === "active") return "running";
  if (z.status === "pending_review" || z.reviewStatus === "in_review") return "in_review";
  return ours;
}

/**
 * Every 10 minutes (apps/client/instrumentation-node.ts): each live ad's
 * numbers and state from Meta; an ad that spent the limit with no message
 * stops; an ad whose days are over ends; and an ad that ended, stopped or was
 * rejected gives back its unspent money once its last spend is read.
 */
export async function runAdsRound(now = new Date()): Promise<void> {
  if (!zernioReady()) return;
  const { data } = await db().from("studio_ads").select("*").is("settled_at", null).not("status", "eq", "failed").limit(200).returns<AdRow[]>();
  if (!data?.length) return;
  const s = await adsSettings();
  const rate = await ugxPerUsd();
  for (const ad of data) {
    try {
      await followAd(ad, s, rate, now);
    } catch (err) {
      console.error("ads: following an ad failed:", ad.id, err);
    }
  }
}

async function followAd(ad: AdRow, s: AdsSettings, rate: number, now: Date): Promise<void> {
  let status = ad.status;
  let spend = Number(ad.spend);
  if (ad.zernio_ad_id) {
    const r = await call<{ ad?: ZAd } & ZAd>("GET", `/ads/${encodeURIComponent(ad.zernio_ad_id)}`);
    const z = r.ad ?? r;
    const m = z.metrics ?? {};
    spend = toShillings(Number(m.spend ?? 0), s.currency, rate);
    status = stateOf(z, ad.status);
    await db()
      .from("studio_ads")
      .update({ spend, impressions: Math.round(Number(m.impressions ?? 0)), reach: Math.round(Number(m.reach ?? 0)), clicks: Math.round(Number(m.clicks ?? 0)), synced_at: now.toISOString(), status })
      .eq("id", ad.id);
  }
  const owner = (await studios.get(ad.tenant_id))?.ownerClientId;
  const say = (title: string, body: string) => (owner ? tell(owner, title, body).catch(() => {}) : Promise.resolve());

  if (status !== ad.status && status === "running") await say("Your ad is live", `"${ad.title}" passed Meta's review and is showing now.`);
  if (status !== ad.status && status === "rejected") await say("Meta rejected your ad", `"${ad.title}" wasn't approved. Your money is coming back to your Aming card.`);

  // Spent the limit, brought nobody: it stops.
  if (status === "running") {
    const leads = (await leadResults(ad.tenant_id, [ad.id])).get(ad.id)?.leads ?? 0;
    if (shouldAutoStop(spend, leads, s.autoStopUgx) && ad.zernio_ad_id) {
      await setMetaStatus(ad.zernio_ad_id, "paused");
      status = "stopped";
      await db().from("studio_ads").update({ status, stop_reason: `No messages after UGX ${spend.toLocaleString("en-UG")}` }).eq("id", ad.id);
      await say("Your ad stopped by itself", `"${ad.title}" spent UGX ${spend.toLocaleString("en-UG")} and nobody wrote to you, so it stopped. The rest of your money is coming back. Try another photo, text or area.`);
    }
  }

  // Its days are over.
  if (isLive(status) && now.getTime() > new Date(ad.ends_at).getTime()) {
    if (ad.zernio_ad_id && status !== "paused") await setMetaStatus(ad.zernio_ad_id, "paused").catch(() => {});
    status = "ended";
    await db().from("studio_ads").update({ status }).eq("id", ad.id);
  }

  const finished = status === "ended" || status === "stopped" || status === "rejected";
  if (!finished) return;
  const finishedAt = ad.finished_at ? new Date(ad.finished_at) : now;
  if (!ad.finished_at) await db().from("studio_ads").update({ finished_at: finishedAt.toISOString() }).eq("id", ad.id);
  // Settled once Meta's last spend is in (it reports a few hours late); a rejected ad spent nothing.
  if (status !== "rejected" && now.getTime() - finishedAt.getTime() < SETTLE_AFTER_MS) return;
  const back = adRefund({ budget: Number(ad.budget), fee: Number(ad.fee), charged: Number(ad.charged) }, status === "rejected" ? 0 : spend);
  const { data: done } = await db().rpc("studio_ad_refund", { p_ad: ad.id, p_amount: back });
  if (!done) return;
  const leads = (await leadResults(ad.tenant_id, [ad.id])).get(ad.id) ?? { leads: 0, booked: 0, paid: 0 };
  await say(
    status === "rejected" ? "Your ad money is back" : "Your ad finished",
    status === "rejected"
      ? `UGX ${back.toLocaleString("en-UG")} is back on your Aming card.`
      : `"${ad.title}": UGX ${spend.toLocaleString("en-UG")} spent, ${leads.leads} ${leads.leads === 1 ? "person" : "people"} wrote, ${leads.booked} booked.${back ? ` UGX ${back.toLocaleString("en-UG")} is back on your Aming card.` : ""}`,
  );
}
