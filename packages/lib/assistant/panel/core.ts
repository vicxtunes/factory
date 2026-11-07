// The Alexis panel's rules that code enforces: who may use it, who pays, what a
// reply is charged and when an account has used its month. Pure.

import type { AssistantMode } from "../core/rules";

/** Who is talking to Alexis: a dashboard user, a designer, a worker, or a client-app account. */
export type PersonType = "staff" | "designer" | "worker" | "client";

/** Who a reply is charged to. Staff, designers and workers count to the company. */
export type PayerType = "company" | "client" | "studio" | "vendor" | "agent";

export interface Payer {
  type: PayerType;
  /** Empty for the company. */
  id: string | null;
}

export const COMPANY: Payer = { type: "company", id: null };

/** How many earlier messages Alexis reads with a new one. */
export const PANEL_HISTORY = 30;
export const MAX_MESSAGE_CHARS = 2000;

/** Charge for a reply: its real cost × the multiplier, in US$. */
export function chargeFor(costUsd: number, multiplier: number): number {
  return Math.round(costUsd * multiplier * 10_000) / 10_000;
}

/** The account has used its month: no more replies until the 1st. The company has no cap. */
export function capReached(payer: Payer, chargedThisMonth: number, capUsd: number): boolean {
  return payer.type !== "company" && chargedThisMonth >= capUsd;
}

/** Charges are waived until the day charging starts (none set: free). `today` is YYYY-MM-DD in Kampala. */
export function isWaived(chargingFrom: string | null, today: string): boolean {
  return !chargingFrom || today < chargingFrom;
}

/** Which of a client-app account's businesses pays, from the page they're on. Anything else: the account itself. */
export function payerForPage(
  page: string,
  clientId: string,
  businesses: { studioId: string | null; vendorId: string | null; agentId: string | null },
): Payer {
  const under = (root: string) => page === root || page.startsWith(`${root}/`);
  if (under("/studio") && businesses.studioId) return { type: "studio", id: businesses.studioId };
  if (under("/vendors") && businesses.vendorId) return { type: "vendor", id: businesses.vendorId };
  if (under("/agents") && businesses.agentId) return { type: "agent", id: businesses.agentId };
  return { type: "client", id: clientId };
}

/**
 * Whether this person sees the panel. Test: only the boss, the developer and the people listed
 * (their email or phone, one a line, as for the chat assistant's test clients).
 */
export function mayUsePanel(
  mode: AssistantMode,
  testList: string,
  person: { alwaysInTest: boolean; email: string | null; phone: string | null },
): boolean {
  if (mode === "live") return true;
  if (mode !== "test") return false;
  if (person.alwaysInTest) return true;
  const lines = testList.split(/[\n,]/).map((l) => l.trim().toLowerCase()).filter(Boolean);
  const digits = (s: string) => s.replace(/\D/g, "").slice(-9);
  return lines.some(
    (l) =>
      (!!person.email && l === person.email.toLowerCase()) ||
      (!!person.phone && digits(l).length === 9 && digits(l) === digits(person.phone)),
  );
}

/** Kampala is UTC+3 all year. */
const KAMPALA_MS = 3 * 3_600_000;

/** Today in Kampala, YYYY-MM-DD. */
export function kampalaDay(now: Date): string {
  return new Date(now.getTime() + KAMPALA_MS).toISOString().slice(0, 10);
}

/** The start of this month in Kampala, as an instant. */
export function startOfKampalaMonth(now: Date): Date {
  const k = new Date(now.getTime() + KAMPALA_MS);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - KAMPALA_MS);
}

/** The start of today in Kampala, as an instant. */
export function startOfKampalaDay(now: Date): Date {
  const k = new Date(now.getTime() + KAMPALA_MS);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KAMPALA_MS);
}

/** The start of next month in Kampala: when a capped account can use Alexis again. */
export function startOfNextKampalaMonth(now: Date): Date {
  const k = new Date(now.getTime() + KAMPALA_MS);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() + 1, 1) - KAMPALA_MS);
}
