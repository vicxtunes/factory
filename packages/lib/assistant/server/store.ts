import "server-only";

import { createAdminClient } from "@repo/lib/supabase/admin";

import { projectMonthTotal, QUIET_BEFORE_ANSWER_MS, RUN_STALE_MS, TOO_OLD_TO_ANSWER_MS, type AssistantMode } from "../core/rules";

export interface AssistantSettings {
  mode: AssistantMode;
  dailyCapUsd: number;
  testClients: string;
  model: string;
}

export interface ThreadRow {
  conversation_id: string;
  state: "active" | "staff";
  pending_since: string | null;
  running_since: string | null;
  pending_order: PendingOrder | null;
}

export interface PendingItem {
  category_id: string;
  product_id: string;
  variant_id: string;
  qty: number;
  attributes: Record<string, string>;
  item_notes: string;
  attachment_ids: string[];
  photo_link: string | null;
}

export interface PendingOrder {
  items: PendingItem[];
  delivery_date: string;
  order_type: "normal" | "express";
  summary: string;
  /** When the client was shown it: set once the reply carrying it is posted. */
  posted_at?: string;
}

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

export async function getSettings(): Promise<AssistantSettings> {
  const row = must(await createAdminClient().from("assistant_settings").select("mode, daily_cap_usd, test_clients, model").single());
  return { mode: row.mode as AssistantMode, dailyCapUsd: Number(row.daily_cap_usd), testClients: row.test_clients, model: row.model };
}

export async function saveSettings(s: Omit<AssistantSettings, "model">): Promise<void> {
  must(
    await createAdminClient()
      .from("assistant_settings")
      .update({ mode: s.mode, daily_cap_usd: s.dailyCapUsd, test_clients: s.testClients, updated_at: new Date().toISOString() })
      .eq("id", true),
  );
}

export async function saveModel(model: string): Promise<void> {
  must(await createAdminClient().from("assistant_settings").update({ model, updated_at: new Date().toISOString() }).eq("id", true));
}

/** Forgets messages too old to answer now, and returns the chats ready for an answer. */
export async function waitingThreads(limit: number): Promise<ThreadRow[]> {
  const db = createAdminClient();
  must(await db.from("assistant_threads").update({ pending_since: null }).lt("pending_since", ago(TOO_OLD_TO_ANSWER_MS)));
  return must(
    await db
      .from("assistant_threads")
      .select("*")
      .eq("state", "active")
      .lt("pending_since", ago(QUIET_BEFORE_ANSWER_MS))
      .or(`running_since.is.null,running_since.lt.${ago(RUN_STALE_MS)}`)
      .order("pending_since")
      .limit(limit),
  ) as ThreadRow[];
}

/** Takes a chat to answer. False when something else has it. */
export async function claim(thread: ThreadRow): Promise<boolean> {
  let q = createAdminClient()
    .from("assistant_threads")
    .update({ running_since: new Date().toISOString() })
    .eq("conversation_id", thread.conversation_id);
  q = thread.running_since ? q.eq("running_since", thread.running_since) : q.is("running_since", null);
  return must(await q.select("conversation_id")).length === 1;
}

/** Done. A message that came in during the answer leaves the chat waiting. */
export async function finish(thread: ThreadRow): Promise<void> {
  const db = createAdminClient();
  if (thread.pending_since) {
    must(
      await db
        .from("assistant_threads")
        .update({ pending_since: null })
        .eq("conversation_id", thread.conversation_id)
        .eq("pending_since", thread.pending_since),
    );
  }
  must(await db.from("assistant_threads").update({ running_since: null }).eq("conversation_id", thread.conversation_id));
}

export async function threadState(conversationId: string): Promise<"active" | "staff" | null> {
  const { data } = await createAdminClient().from("assistant_threads").select("state").eq("conversation_id", conversationId).maybeSingle();
  return (data?.state as "active" | "staff" | undefined) ?? null;
}

export async function setState(conversationId: string, state: "active" | "staff"): Promise<void> {
  must(
    await createAdminClient()
      .from("assistant_threads")
      .upsert({ conversation_id: conversationId, state, ...(state === "staff" ? { pending_since: null } : {}) }),
  );
}

export async function setPendingOrder(conversationId: string, order: PendingOrder): Promise<void> {
  must(await createAdminClient().from("assistant_threads").update({ pending_order: order }).eq("conversation_id", conversationId));
}

export async function getPendingOrder(conversationId: string): Promise<PendingOrder | null> {
  const row = must(await createAdminClient().from("assistant_threads").select("pending_order").eq("conversation_id", conversationId).single());
  return row.pending_order as PendingOrder | null;
}

/** Takes the summary off the chat, so it can only ever be placed once. Null when it's already gone. */
export async function takePendingOrder(conversationId: string): Promise<boolean> {
  const rows = must(
    await createAdminClient()
      .from("assistant_threads")
      .update({ pending_order: null })
      .eq("conversation_id", conversationId)
      .not("pending_order", "is", null)
      .select("conversation_id"),
  );
  return rows.length === 1;
}

export async function markSummaryPosted(conversationId: string): Promise<void> {
  const order = await getPendingOrder(conversationId);
  if (order && !order.posted_at) await setPendingOrder(conversationId, { ...order, posted_at: new Date().toISOString() });
}

export async function logRun(run: {
  conversationId: string;
  clientId: string | null;
  reply: string | null;
  actions: string[];
  error: string | null;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
}): Promise<void> {
  must(
    await createAdminClient().from("assistant_runs").insert({
      conversation_id: run.conversationId,
      client_id: run.clientId,
      reply: run.reply,
      actions: run.actions,
      error: run.error,
      input_tokens: run.input,
      output_tokens: run.output,
      cache_read_tokens: run.cacheRead,
      cache_write_tokens: run.cacheWrite,
      cost_usd: run.costUsd,
    }),
  );
}

/** Start of today in Kampala (UTC+3, no daylight saving). */
function startOfToday(): string {
  const kampala = new Date(Date.now() + 3 * 3_600_000);
  kampala.setUTCHours(0, 0, 0, 0);
  return new Date(kampala.getTime() - 3 * 3_600_000).toISOString();
}

export async function spentToday(): Promise<number> {
  const rows = must(await createAdminClient().from("assistant_runs").select("cost_usd").gte("created_at", startOfToday()));
  return rows.reduce((sum, r) => sum + Number(r.cost_usd), 0);
}

/** This month in Kampala so far, and where it's heading. */
export async function monthStats(): Promise<{ spent: number; replies: number; perReply: number; projected: number }> {
  const now = new Date();
  const kampala = new Date(now.getTime() + 3 * 3_600_000);
  const start = new Date(Date.UTC(kampala.getUTCFullYear(), kampala.getUTCMonth(), 1) - 3 * 3_600_000);
  const daysInMonth = new Date(Date.UTC(kampala.getUTCFullYear(), kampala.getUTCMonth() + 1, 0)).getUTCDate();
  const rows = must(await createAdminClient().rpc("assistant_month_stats", { p_since: start.toISOString() })) as {
    total_usd: number;
    replies: number;
    first_at: string | null;
  }[];
  const spent = Number(rows[0]?.total_usd ?? 0);
  const replies = Number(rows[0]?.replies ?? 0);
  return { spent, replies, perReply: replies ? spent / replies : 0, projected: projectMonthTotal(spent, rows[0]?.first_at ?? null, now, daysInMonth) };
}

export interface RunRow {
  id: string;
  conversation_id: string | null;
  reply: string | null;
  actions: string[];
  error: string | null;
  cost_usd: number;
  created_at: string;
  clients: { name: string } | null;
}

export async function recentRuns(limit: number): Promise<RunRow[]> {
  return must(
    await createAdminClient()
      .from("assistant_runs")
      .select("id, conversation_id, reply, actions, error, cost_usd, created_at, clients(name)")
      // Chat answers only: the Alexis panel's runs are in usageByPayer.
      .is("person_type", null)
      .order("created_at", { ascending: false })
      .limit(limit),
  ) as unknown as RunRow[];
}
