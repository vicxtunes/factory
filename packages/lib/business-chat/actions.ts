"use server";

// The chat on a Pro business's page (./core.ts): one answer per message, the
// conversation kept in the visitor's browser. Anyone visiting the page may
// ask; each browser and each business has a daily limit, and every answer
// counts towards Alexis's daily spending cap.

import { createHash, randomUUID } from "node:crypto";

import { cookies, headers } from "next/headers";

import { localDate } from "@repo/lib/accounting/core/period";
import { costUsd, findModel, type TokenUsage } from "@repo/lib/assistant/core/rules";
import { startOfKampalaMonth, startOfNextKampalaMonth } from "@repo/lib/assistant/panel/core";
import { hasAiKey, panelSettings } from "@repo/lib/assistant/panel/server";
import { askModel } from "@repo/lib/assistant/server/providers";
import { spentToday } from "@repo/lib/assistant/server/store";
import { bookedDays } from "@repo/lib/booking-requests/server";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { dealPrice, runningDeal } from "@repo/lib/offerings/core";
import type { CategoryWithServices } from "@repo/lib/offerings/core";
import { offerings } from "@repo/lib/offerings/server";
import { studioAtSlug } from "@repo/lib/studio-portal/server";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { formatAmount } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { businessChatOn } from "./server";
import { ADDRESS_DAILY, BUSINESS_CHAT_PROMPT, BUSINESS_DAILY, BUSINESS_MONTHLY_USD, cleanTurns, factsText, VISITOR_DAILY, type FactItem, type PageFacts } from "./core";

const VISITOR_COOKIE = "aming_chat_visitor";
const ACTION = "Business chat";

export type BusinessChatResult = { ok: true; reply: string } | { ok: false; error: string };

export async function askBusiness(slug: unknown, turns: unknown): Promise<BusinessChatResult> {
  try {
    const at = typeof slug === "string" ? await studioAtSlug(slug.slice(0, 60)) : null;
    if (!at) return { ok: false, error: "This page isn't open." };
    const messages = cleanTurns(turns);
    if (!messages.length) return { ok: false, error: "Write a message first." };
    if (!(await businessChatOn(at.studio.id))) return { ok: false, error: "The chat isn't on for this page." };

    const settings = await panelSettings();
    const model = findModel(settings.model);
    if (!model || !hasAiKey(model.provider)) return { ok: false, error: "The chat isn't available just now. Call or WhatsApp the business." };
    if ((await spentToday()) >= settings.dailyCapUsd) return { ok: false, error: "The chat is resting until tomorrow. Call or WhatsApp the business." };

    const jar = await cookies();
    let visitor = jar.get(VISITOR_COOKIE)?.value;
    if (!visitor || !/^[0-9a-f-]{36}$/.test(visitor)) {
      visitor = randomUUID();
      jar.set(VISITOR_COOKIE, visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 365 * 86_400, path: "/" });
    }
    // The network address too (a new browser or cleared cookies is a new visitor), kept only as a hash.
    const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const address = createHash("sha256").update(`business-chat:${ip}`).digest("hex").slice(0, 16);
    const key = `${visitor}|${address}`;
    const db = createAdminClient();
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const monthStart = startOfKampalaMonth(new Date()).toISOString();
    const runs = () => db.from("assistant_runs").select("id", { count: "exact", head: true }).not("visitor", "is", null).gte("created_at", since);
    const [{ count: mine }, { count: fromAddress }, { count: theirs }, { data: month }] = await Promise.all([
      runs().like("visitor", `${visitor}|%`),
      runs().like("visitor", `%|${address}`),
      runs().eq("payer_type", "studio").eq("payer_id", at.studio.id),
      db.from("assistant_runs").select("cost_usd").eq("payer_type", "studio").eq("payer_id", at.studio.id).not("visitor", "is", null).gte("created_at", monthStart).returns<{ cost_usd: number | string }[]>(),
    ]);
    const spent = (month ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0);
    const busy = "The chat is busy just now. Call or WhatsApp the business.";
    if ((mine ?? 0) >= VISITOR_DAILY || (fromAddress ?? 0) >= ADDRESS_DAILY) return { ok: false, error: "That's a lot of questions for one day. Call or WhatsApp the business for more." };
    if ((theirs ?? 0) >= BUSINESS_DAILY || spent >= BUSINESS_MONTHLY_USD) return { ok: false, error: busy };

    const facts = await pageFacts(at.studio, at.scope, slug as string);
    let totals: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let reply: string | null = null;
    let failure: string | null = null;
    try {
      const answered = await askModel({
        model,
        system: BUSINESS_CHAT_PROMPT,
        context: factsText(facts),
        tools: [],
        messages,
        // A few sentences (with room for the AI's own thinking): a long, costly reply can't be asked for.
        maxTokens: 1000,
        onUsage: (u) => {
          totals = u;
        },
      });
      reply = answered.refused || !answered.text ? null : answered.text.trim();
      if (!reply) failure = answered.refused ? "The AI declined to answer." : "The AI gave no reply.";
    } catch (err) {
      failure = err instanceof Error ? err.message : "The AI couldn't be reached.";
      console.error("business chat failed:", at.studio.id, err);
    }
    const cost = costUsd(model, totals);
    const { error } = await db.from("assistant_runs").insert({
      reply,
      error: failure,
      actions: [ACTION],
      input_tokens: totals.input,
      output_tokens: totals.output,
      cache_read_tokens: totals.cacheRead,
      cache_write_tokens: totals.cacheWrite,
      cost_usd: cost,
      payer_type: "studio",
      payer_id: at.studio.id,
      multiplier: 1,
      // Part of Pro: Aming pays.
      charge_usd: 0,
      waived: true,
      visitor: key,
    });
    if (error) console.error("business chat: recording the run failed:", error);
    // The owner hears once when this answer used up the day's or the month's allowance.
    if (!error) await tellIfLimitReached(at.studio, (theirs ?? 0) + 1, spent, spent + cost);
    return reply ? { ok: true, reply } : { ok: false, error: "Sorry, the chat couldn't answer just now. Try again in a moment." };
  } catch (err) {
    console.error("business chat:", err);
    return { ok: false, error: "Sorry, the chat couldn't answer just now. Try again in a moment." };
  }
}

async function pageFacts(studio: NonNullable<Awaited<ReturnType<typeof studioAtSlug>>>["studio"], scope: TenantScope, slug: string): Promise<PageFacts> {
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

async function tellIfLimitReached(studio: { name: string; ownerClientId: string }, today: number, before: number, after: number): Promise<void> {
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
