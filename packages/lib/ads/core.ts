// Ads for businesses (owner, 2026-11-28): shapes and the money rules. Pure.
// A business promotes a service from Aming's own Facebook / Instagram Page;
// it pays the budget plus Aming's fee when the ad starts, and gets back the
// unspent budget (and that share of the fee) when it ends. An ad that spends
// without bringing a single message stops by itself.

export type AdStatus = "starting" | "in_review" | "running" | "paused" | "ended" | "stopped" | "rejected" | "failed";

export const AD_STATUS_LABEL: Record<AdStatus, string> = {
  starting: "Starting",
  in_review: "In review",
  running: "Running",
  paused: "Paused",
  ended: "Ended",
  stopped: "Stopped",
  rejected: "Rejected",
  failed: "Failed",
};

/** Still running or able to run: its money isn't settled yet. */
export const isLive = (s: AdStatus) => s === "starting" || s === "in_review" || s === "running" || s === "paused";

export interface AdPlace {
  key: string;
  name: string;
}

export interface AdInterest {
  id: string;
  name: string;
}

/** One of the business's ads, with what it brought. */
export interface StudioAd {
  id: string;
  title: string;
  body: string;
  serviceSlug: string | null;
  photoUrl: string | null;
  places: AdPlace[];
  ageMin: number;
  ageMax: number;
  gender: "all" | "male" | "female";
  interests: AdInterest[];
  dailyBudget: number;
  days: number;
  budget: number;
  fee: number;
  charged: number;
  startsAt: string;
  endsAt: string;
  status: AdStatus;
  stopReason: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  refunded: number | null;
  /** Made while Aming's ad account wasn't connected: it went nowhere and cost nothing. */
  practice: boolean;
  /** Where the ad leads: the business's page (or a service's), marked as this ad's. */
  link: string;
  /** People who wrote from it (leads with this ad), and of them how many booked and paid. */
  leads: number;
  booked: number;
  paid: number;
  createdAt: string;
}

/** What the business pays when it starts an ad: the budget and Aming's fee on it (whole shillings). */
export function adPrice(dailyBudget: number, days: number, feePercent: number): { budget: number; fee: number; total: number } {
  const budget = Math.round(dailyBudget) * Math.round(days);
  const fee = Math.ceil((budget * feePercent) / 100);
  return { budget, fee, total: budget + fee };
}

/** What goes back when it ends: the budget not spent, and the fee on it. Never negative, never more than was paid. */
export function adRefund(ad: { budget: number; fee: number; charged: number }, spend: number): number {
  const unspent = Math.max(0, ad.budget - Math.max(0, Math.ceil(spend)));
  const feeBack = ad.budget > 0 ? Math.floor((ad.fee * unspent) / ad.budget) : 0;
  return Math.min(ad.charged, unspent + feeBack);
}

/** It spent enough to have brought someone, and brought nobody: it stops. */
export const shouldAutoStop = (spend: number, leads: number, limit: number) => leads === 0 && spend >= limit;

/** Spend in the ad account's currency, in shillings. */
export const toShillings = (amount: number, currency: string | null, ugxPerUsd: number) => Math.ceil(!currency || currency === "UGX" ? amount : currency === "USD" ? amount * ugxPerUsd : amount);
/** A shilling amount in the ad account's currency (whole units, rounded down so the budget never goes over what was paid). */
export const fromShillings = (ugx: number, currency: string | null, ugxPerUsd: number) => (!currency || currency === "UGX" ? Math.floor(ugx) : currency === "USD" ? Math.floor(ugx / ugxPerUsd) : Math.floor(ugx));
