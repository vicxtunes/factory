"use server";

// The chat on a Pro business's page (./core.ts): one answer per message, the
// conversation kept in the visitor's browser. Anyone visiting the page may
// ask; each browser and each business has a daily limit, and every answer
// counts towards Alexis's daily spending cap.

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { localDate } from "@repo/lib/accounting/core/period";
import { costUsd, findModel, type TokenUsage } from "@repo/lib/assistant/core/rules";
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
import { BUSINESS_CHAT_PROMPT, BUSINESS_DAILY, cleanTurns, factsText, VISITOR_DAILY, type FactItem, type PageFacts } from "./core";

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
    const db = createAdminClient();
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const [{ count: mine }, { count: theirs }] = await Promise.all([
      db.from("assistant_runs").select("id", { count: "exact", head: true }).eq("visitor", visitor).gte("created_at", since),
      db.from("assistant_runs").select("id", { count: "exact", head: true }).eq("payer_type", "studio").eq("payer_id", at.studio.id).contains("actions", [ACTION]).gte("created_at", since),
    ]);
    if ((mine ?? 0) >= VISITOR_DAILY) return { ok: false, error: "That's a lot of questions for one day. Call or WhatsApp the business for more." };
    if ((theirs ?? 0) >= BUSINESS_DAILY) return { ok: false, error: "The chat is busy today. Call or WhatsApp the business." };

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
      visitor,
    });
    if (error) console.error("business chat: recording the run failed:", error);
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
