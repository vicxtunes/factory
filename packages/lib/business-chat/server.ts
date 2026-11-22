import "server-only";

import { startOfKampalaMonth, startOfNextKampalaMonth } from "@repo/lib/assistant/panel/core";
import { panelSettings } from "@repo/lib/assistant/panel/server";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { isPro } from "@repo/lib/pro/core";
import { proStatus } from "@repo/lib/pro/server";

import { BUSINESS_MONTHLY_USD } from "./core";

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
