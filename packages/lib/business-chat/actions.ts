"use server";

// The chat on a Pro business's page (./core.ts): one answer per message, the
// conversation kept in the visitor's browser. Anyone visiting the page may
// ask; each browser and each business has a daily limit, and every answer
// counts towards Alexis's daily spending cap.

import { createHash, randomUUID } from "node:crypto";

import { cookies, headers } from "next/headers";

import { costUsd, findModel, type TokenUsage } from "@repo/lib/assistant/core/rules";
import { hasAiKey, panelSettings } from "@repo/lib/assistant/panel/server";
import { askModel } from "@repo/lib/assistant/server/providers";
import { spentToday } from "@repo/lib/assistant/server/store";
import { studioAtSlug } from "@repo/lib/studio-portal/server";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { businessChatOn, businessSpend, pageFacts, tellIfLimitReached } from "./server";
import { ADDRESS_DAILY, BUSINESS_CHAT_PROMPT, BUSINESS_DAILY, BUSINESS_MONTHLY_USD, cleanTurns, factsText, VISITOR_DAILY } from "./core";

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
    const runs = () => db.from("assistant_runs").select("id", { count: "exact", head: true }).not("visitor", "is", null).gte("created_at", since);
    const [{ count: mine }, { count: fromAddress }, { today: theirs, monthUsd: spent }] = await Promise.all([
      runs().like("visitor", `${visitor}|%`),
      runs().like("visitor", `%|${address}`),
      businessSpend(at.studio.id),
    ]);
    const busy = "The chat is busy just now. Call or WhatsApp the business.";
    if ((mine ?? 0) >= VISITOR_DAILY || (fromAddress ?? 0) >= ADDRESS_DAILY) return { ok: false, error: "That's a lot of questions for one day. Call or WhatsApp the business for more." };
    if (theirs >= BUSINESS_DAILY || spent >= BUSINESS_MONTHLY_USD) return { ok: false, error: busy };

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
    if (!error) await tellIfLimitReached(at.studio, theirs + 1, spent, spent + cost);
    return reply ? { ok: true, reply } : { ok: false, error: "Sorry, the chat couldn't answer just now. Try again in a moment." };
  } catch (err) {
    console.error("business chat:", err);
    return { ok: false, error: "Sorry, the chat couldn't answer just now. Try again in a moment." };
  }
}
