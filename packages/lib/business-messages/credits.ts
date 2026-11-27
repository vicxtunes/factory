import "server-only";

// A business's AI credits (owner, 2026-11-27: "sell them credits on Pro, and
// when they're done they can add more"), in whole shillings: each month on Pro
// it gets the boss's monthly credits; its assistant's answers (Alexis selling
// in its chats, Ask us on its page) use them at the AI's cost × Alexis's
// charge multiplier; the owner buys more from their Aming card. Out of
// credits, the assistant rests and the team answers.
// Table: supabase/migrations/20270131100000_lead_sales.sql.

import { panelSettings } from "@repo/lib/assistant/panel/server";
import { isPro } from "@repo/lib/pro/core";
import { proStatus } from "@repo/lib/pro/server";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { BizChatError } from "./server";

const db = () => createAdminClient();

/** Packs on sale (whole shillings); the database takes only these. */
export const CREDIT_PACKS = [10000, 25000, 50000] as const;

const kampalaMonth = (now: Date) => new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 7);

async function creditSettings(): Promise<{ monthly: number; ugxPerUsd: number; multiplier: number }> {
  const [{ data }, panel] = await Promise.all([db().from("assistant_settings").select("studio_monthly_credits, ugx_per_usd").single<{ studio_monthly_credits: number; ugx_per_usd: number }>(), panelSettings()]);
  return { monthly: Number(data?.studio_monthly_credits ?? 20000), ugxPerUsd: Number(data?.ugx_per_usd ?? 3700), multiplier: panel.multiplier };
}

/** This month's Pro credits, given once a month (the first time they're looked at). */
async function grantMonth(tenantId: string, now: Date): Promise<void> {
  const month = kampalaMonth(now);
  const { count } = await db().from("ai_credit_ledger").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("kind", "monthly").eq("month", month);
  if (count) return;
  if (!isPro(await proStatus(tenantId))) return;
  const { monthly } = await creditSettings();
  if (monthly <= 0) return;
  // The unique index keeps it once a month if two ask at the same moment.
  await db().from("ai_credit_ledger").insert({ tenant_id: tenantId, kind: "monthly", amount: monthly, month, note: "Pro: this month's credits" });
}

/** What's left (whole shillings). */
export async function creditBalance(tenantId: string, now = new Date()): Promise<number> {
  await grantMonth(tenantId, now);
  const { data, error } = await db().from("ai_credit_ledger").select("amount").eq("tenant_id", tenantId).limit(100000).returns<{ amount: number }[]>();
  if (error) throw new Error(`credits: ${error.message}`);
  return data.reduce((sum, r) => sum + Number(r.amount), 0);
}

/** An answer's cost in credits: the AI's cost (USD) × the charge multiplier, in shillings, at least 1. */
export async function spendCredits(tenantId: string, costUsd: number, note: string): Promise<number> {
  const { ugxPerUsd, multiplier } = await creditSettings();
  const amount = Math.max(1, Math.ceil(costUsd * multiplier * ugxPerUsd));
  const { error } = await db().from("ai_credit_ledger").insert({ tenant_id: tenantId, kind: "usage", amount: -amount, note });
  if (error) console.error("credits: couldn't record use:", error.message);
  return amount;
}

/** The owner buys a pack from their Aming card. */
export async function buyCredits(tenantId: string, amount: number, actor: { id: string; name: string }): Promise<void> {
  if (!CREDIT_PACKS.includes(amount as (typeof CREDIT_PACKS)[number])) throw new BizChatError("Pick a pack.");
  const { error } = await db().rpc("ai_credits_buy", { p_tenant: tenantId, p_amount: amount, p_actor_id: actor.id, p_actor_name: actor.name });
  if (!error) return;
  if (error.message.includes("WALLET:insufficient_funds")) throw new BizChatError("There isn't enough on your Aming card. Add money to it with MTN or Airtel, then buy again.");
  throw new Error(`credits: ${error.message}`);
}

/** The credits' story for the owner: balance, this month's use, and the latest movements. */
export async function creditSummary(tenantId: string, now = new Date()): Promise<{ balance: number; usedThisMonth: number; recent: { kind: string; amount: number; at: string }[] }> {
  const balance = await creditBalance(tenantId, now);
  const monthStart = new Date(`${kampalaMonth(now)}-01T00:00:00+03:00`).toISOString();
  const [{ data: used }, { data: recent }] = await Promise.all([
    db().from("ai_credit_ledger").select("amount").eq("tenant_id", tenantId).eq("kind", "usage").gte("created_at", monthStart).limit(100000).returns<{ amount: number }[]>(),
    db().from("ai_credit_ledger").select("kind, amount, created_at").eq("tenant_id", tenantId).neq("kind", "usage").order("created_at", { ascending: false }).limit(10).returns<{ kind: string; amount: number; created_at: string }[]>(),
  ]);
  return {
    balance,
    usedThisMonth: -(used ?? []).reduce((sum, r) => sum + Number(r.amount), 0),
    recent: (recent ?? []).map((r) => ({ kind: r.kind, amount: Number(r.amount), at: r.created_at })),
  };
}
