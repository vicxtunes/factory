import "server-only";

import { localDate } from "@repo/lib/accounting/core/period";
import { startOfKampalaMonth, startOfNextKampalaMonth } from "@repo/lib/assistant/panel/core";
import { panelSettings } from "@repo/lib/assistant/panel/server";
import { bookedDays } from "@repo/lib/booking-requests/server";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { dealPrice, runningDeal, type CategoryWithServices } from "@repo/lib/offerings/core";
import { offerings } from "@repo/lib/offerings/server";
import { isPro } from "@repo/lib/pro/core";
import { proStatus } from "@repo/lib/pro/server";
import type { Studio } from "@repo/lib/studios/core";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { BUSINESS_DAILY, BUSINESS_MONTHLY_USD, type FactItem, type PageFacts } from "./core";

/** Whether this business's page has the chat (./core.ts): Pro, and the AI not switched off. */
export async function businessChatOn(tenantId: string): Promise<boolean> {
  const [status, settings] = await Promise.all([proStatus(tenantId), panelSettings()]);
  return isPro(status) && settings.panelMode !== "off";
}

export interface ChatUsage {
  answersToday: number;
  answersThisMonth: number;
  /** Share of the month's allowance used, 0–100. */
  usedPercent: number;
  /** When the month's allowance starts again (ISO). */
  resetsAt: string;
}

/** How much of its chat a business has used (its Pro screen, and the chat's own limits). */
export async function chatUsage(tenantId: string, now = new Date()): Promise<ChatUsage> {
  const db = createAdminClient();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const { data, error } = await db
    .from("assistant_runs")
    .select("cost_usd, created_at, reply")
    .eq("payer_type", "studio")
    .eq("payer_id", tenantId)
    .not("visitor", "is", null)
    .gte("created_at", startOfKampalaMonth(now).toISOString())
    .returns<{ cost_usd: number | string; created_at: string; reply: string | null }[]>();
  if (error) throw new Error(`Could not read the chat's use: ${error.message}`);
  const spent = data.reduce((sum, r) => sum + Number(r.cost_usd), 0);
  return {
    answersToday: data.filter((r) => r.reply && r.created_at >= dayAgo).length,
    answersThisMonth: data.filter((r) => r.reply).length,
    usedPercent: Math.min(100, Math.round((spent / BUSINESS_MONTHLY_USD) * 100)),
    resetsAt: startOfNextKampalaMonth(now).toISOString(),
  };
}

/** The chat's answers for a business in the last day, and what its answers cost this month (USD): its allowance. */
export async function businessSpend(tenantId: string, now = new Date()): Promise<{ today: number; monthUsd: number }> {
  const db = createAdminClient();
  const [{ count }, { data }] = await Promise.all([
    db.from("assistant_runs").select("id", { count: "exact", head: true }).not("visitor", "is", null).eq("payer_type", "studio").eq("payer_id", tenantId).gte("created_at", new Date(now.getTime() - 86_400_000).toISOString()),
    db.from("assistant_runs").select("cost_usd").eq("payer_type", "studio").eq("payer_id", tenantId).not("visitor", "is", null).gte("created_at", startOfKampalaMonth(now).toISOString()).returns<{ cost_usd: number | string }[]>(),
  ]);
  return { today: count ?? 0, monthUsd: (data ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0) };
}

/** What the chat may say about the business: its page's services, prices, deals, contacts and booked days. */
export async function pageFacts(studio: Studio, scope: TenantScope, slug: string): Promise<PageFacts> {
  const today = localDate(new Date(), scope.timeZone);
  const [services, products, settings, booked] = await Promise.all([
    offerings.showroom(scope, "service"),
    offerings.showroom(scope, "product"),
    offerings.settings(scope),
    bookedDays(scope, today).catch(() => [] as string[]),
  ]);
  const now = new Date();
  const items = (cats: CategoryWithServices[], path: "s" | "p"): FactItem[] =>
    cats.flatMap((c) =>
      c.services.slice(0, 40).map((s) => {
        const deal = runningDeal(s, now);
        return {
          name: s.name,
          link: clientUrl(`/${slug}/${path}/${s.slug}`),
          description: s.description,
          deal: deal ? `${deal.percent}% off` : null,
          packages: s.packages.slice(0, 12).map((p) => ({
            name: p.name,
            price: settings.showPrices ? formatAmount(scope, dealPrice(p.price, deal)) + (deal ? ` (was ${formatAmount(scope, p.price)})` : "") : null,
            inclusions: p.inclusions,
          })),
        };
      }),
    );
  return {
    name: studio.name,
    link: clientUrl(`/${slug}`),
    phone: studio.phone,
    email: studio.email,
    address: studio.address,
    socials: Object.values(studio.socials).filter((v): v is string => !!v),
    showPrices: settings.showPrices,
    today,
    booked: booked.slice(0, 60),
    services: items(services, "s"),
    products: items(products, "p"),
  };
}

/** The owner hears once when an answer used up the day's or the month's allowance. */
export async function tellIfLimitReached(studio: { name: string; ownerClientId: string }, today: number, before: number, after: number): Promise<void> {
  const { tell } = await import("@repo/lib/pro/server");
  const phone = "Visitors see your phone and WhatsApp instead.";
  try {
    if (before < BUSINESS_MONTHLY_USD && after >= BUSINESS_MONTHLY_USD) {
      const resumes = startOfNextKampalaMonth(new Date()).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Kampala" });
      await tell(studio.ownerClientId, "Your page's chat has used this month's allowance", `Ask us on ${studio.name}'s page is resting until ${resumes}. ${phone}`);
    } else if (today === BUSINESS_DAILY) {
      await tell(studio.ownerClientId, "Your page's chat reached today's limit", `Ask us answered ${BUSINESS_DAILY} questions today, the most in a day. It's back tomorrow. ${phone}`);
    }
  } catch (err) {
    console.error("business chat: telling the owner failed:", err);
  }
}
