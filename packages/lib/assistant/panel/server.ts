import "server-only";

import { z } from "zod";

import { agentOfClient } from "@repo/lib/agents/server";
import { getClientSession, getDashboardSession, getDesignerSession, getWorkerSession } from "@repo/lib/auth/session";
import { clientCurrency } from "@repo/lib/currency/server";
import { BASE_CURRENCY, formatIn, type DisplayCurrency } from "@repo/lib/currency/format";
import { studioOfCaller } from "@repo/lib/studios/server";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { SUPPORT_OWNER_EMAIL } from "@repo/lib/support/constants";
import { vendors } from "@repo/lib/vendors/server";

import { costUsd, findModel, type AssistantMode, type TokenUsage } from "../core/rules";
import { askModel } from "../server/providers";
import { spentToday } from "../server/store";
import type { AssistantTool } from "../server/tools";
import {
  capReached,
  chargeFor,
  COMPANY,
  isWaived,
  kampalaDay,
  MAX_MESSAGE_CHARS,
  mayUsePanel,
  PANEL_HISTORY,
  payerForPage,
  startOfKampalaDay,
  startOfKampalaMonth,
  startOfNextKampalaMonth,
  type Payer,
  type PayerType,
  type PersonType,
} from "./core";
import { PANEL_PROMPT } from "./prompt";

function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

/** The person signed in on this request. */
export interface Person {
  type: PersonType;
  id: string;
  name: string;
  /** In words, for Alexis: "boss", "receptionist", "designer", "client"… */
  role: string;
  email: string | null;
  phone: string | null;
  /** The boss and the developer: they see the panel while it's in test. */
  alwaysInTest: boolean;
}

/** Same order as the audit log's resolveActor: whichever sign-in this request carries. */
export async function currentPerson(): Promise<Person | null> {
  const dashboard = await getDashboardSession();
  if (dashboard) {
    return {
      type: "staff",
      id: dashboard.userId,
      name: dashboard.fullName || dashboard.email || "Staff",
      role: dashboard.role,
      email: dashboard.email,
      phone: null,
      alwaysInTest: dashboard.role === "boss" || dashboard.email === SUPPORT_OWNER_EMAIL,
    };
  }
  const designer = await getDesignerSession();
  if (designer) return { type: "designer", id: designer.designer_id, name: designer.name, role: "designer", email: null, phone: null, alwaysInTest: false };
  const worker = await getWorkerSession();
  if (worker) return { type: "worker", id: worker.worker_id, name: worker.name, role: "factory worker", email: null, phone: null, alwaysInTest: false };
  const client = await getClientSession();
  if (client) {
    const row = must(await createAdminClient().from("clients").select("email, phone").eq("id", client.client_id).single());
    return { type: "client", id: client.client_id, name: client.name, role: "client", email: row.email, phone: row.phone, alwaysInTest: false };
  }
  return null;
}

/** Who pays for what this person asks on this page. A client-app account pays as the business it's working in. */
async function payerOf(person: Person, page: string): Promise<Payer> {
  if (person.type !== "client") return COMPANY;
  const under = (root: string) => page === root || page.startsWith(`${root}/`);
  const [studioId, vendorId, agentId] = await Promise.all([
    under("/studio") ? studioOfCaller("anyone").then((c) => c.studio.id, () => null) : null,
    under("/vendors") ? vendors.mine(person.id).then((v) => v?.id ?? null) : null,
    under("/agents") ? agentOfClient(person.id).then((a) => a?.id ?? null) : null,
  ]);
  return payerForPage(page, person.id, { studioId, vendorId, agentId });
}

interface PanelSettings {
  panelMode: AssistantMode;
  testClients: string;
  model: string;
  dailyCapUsd: number;
  multiplier: number;
  monthlyCapUsd: number;
  chargingFrom: string | null;
}

export async function panelSettings(): Promise<PanelSettings> {
  const row = must(
    await createAdminClient()
      .from("assistant_settings")
      .select("panel_mode, test_clients, model, daily_cap_usd, charge_multiplier, monthly_cap_usd, charging_from")
      .single(),
  );
  return {
    panelMode: row.panel_mode as AssistantMode,
    testClients: row.test_clients,
    model: row.model,
    dailyCapUsd: Number(row.daily_cap_usd),
    multiplier: Number(row.charge_multiplier),
    monthlyCapUsd: Number(row.monthly_cap_usd),
    chargingFrom: row.charging_from,
  };
}

export interface Terms {
  version: number;
  body: string;
  publishedAt: string;
}

export async function currentTerms(): Promise<Terms | null> {
  const row = must(
    await createAdminClient().from("assistant_terms").select("version, body, published_at").order("version", { ascending: false }).limit(1),
  )[0];
  return row ? { version: row.version, body: row.body, publishedAt: row.published_at } : null;
}

async function hasAgreed(person: Person, version: number): Promise<boolean> {
  const { count, error } = await createAdminClient()
    .from("assistant_terms_acceptances")
    .select("version", { count: "exact", head: true })
    .eq("person_type", person.type)
    .eq("person_id", person.id)
    .eq("version", version);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function agreeToTerms(person: Person, version: number): Promise<void> {
  const terms = await currentTerms();
  if (!terms || terms.version !== version) throw new Error("These terms have changed. Read the new ones.");
  must(
    await createAdminClient()
      .from("assistant_terms_acceptances")
      .upsert({ person_type: person.type, person_id: person.id, version }, { onConflict: "person_type,person_id,version", ignoreDuplicates: true }),
  );
}

/** A new version of the terms: everyone agrees again before their next use. */
export async function publishTerms(body: string, by: string): Promise<number> {
  const version = ((await currentTerms())?.version ?? 0) + 1;
  must(await createAdminClient().from("assistant_terms").insert({ version, body, published_by: by }));
  return version;
}

// ---------- Money ----------

/** US$ shown in the person's currency, through the US dollar's rate. Without one, in US$. */
async function usdFormatter(person: Person): Promise<(usd: number) => string> {
  const currency: DisplayCurrency = person.type === "client" ? await clientCurrency() : BASE_CURRENCY;
  const usd = must(await createAdminClient().from("currencies").select("rate").eq("code", "USD").maybeSingle()) as { rate: number } | null;
  const perUgx = Number(usd?.rate ?? 0);
  if (!(perUgx > 0)) return (amount) => `US$${amount.toFixed(2)}`;
  return (amount) => formatIn(amount / perUgx, currency);
}

interface ChargeRow {
  charge_usd: number;
  created_at: string;
}

/** Charges for this payer (the company: this person's own) since a moment, newest first. */
async function chargesSince(person: Person, payer: Payer, since: Date, limit: number): Promise<ChargeRow[]> {
  let query = createAdminClient().from("assistant_runs").select("charge_usd, created_at").gte("created_at", since.toISOString());
  query = payer.type === "company" ? query.eq("person_type", person.type).eq("person_id", person.id) : query.eq("payer_type", payer.type).eq("payer_id", payer.id!);
  return must(await query.order("created_at", { ascending: false }).limit(limit)) as ChargeRow[];
}

async function chargedThisMonth(payer: Payer): Promise<number> {
  if (payer.type === "company") return 0;
  const total = must(
    await createAdminClient().rpc("assistant_payer_charged", { p_type: payer.type, p_id: payer.id, p_since: startOfKampalaMonth(new Date()).toISOString() }),
  );
  return Number(total);
}

const PAYER_WORDS: Record<PayerType, string> = {
  company: "Counted to Aming. You're never charged for it.",
  client: "Charged to your account.",
  studio: "Charged to your business. Everyone on its team shares one bill.",
  vendor: "Charged to your vendor account.",
  agent: "Charged to your agent account.",
};

export interface UsageView {
  free: boolean;
  payerWords: string;
  today: string;
  month: string;
  /** Null for the company: it has no cap. */
  cap: { limit: string; reached: boolean; resumes: string } | null;
  months: { label: string; amount: string }[];
  recent: { at: string; amount: string }[];
}

async function usageView(person: Person, payer: Payer, settings: PanelSettings): Promise<UsageView> {
  const now = new Date();
  const money = await usdFormatter(person);
  const sixMonthsAgo = new Date(startOfKampalaMonth(now));
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5);
  const rows = await chargesSince(person, payer, sixMonthsAgo, 5000);
  const sum = (from: Date) => rows.filter((r) => Date.parse(r.created_at) >= from.getTime()).reduce((s, r) => s + Number(r.charge_usd), 0);
  const monthTotal = sum(startOfKampalaMonth(now));

  const byMonth = new Map<string, number>();
  for (const r of rows) {
    const key = kampalaDay(new Date(r.created_at)).slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(r.charge_usd));
  }
  const monthName = (key: string) => new Date(`${key}-15T00:00:00Z`).toLocaleDateString("en-UG", { month: "long", year: "numeric", timeZone: "UTC" });
  const when = (iso: string) => new Date(iso).toLocaleString("en-UG", { timeZone: "Africa/Kampala", dateStyle: "medium", timeStyle: "short" });

  return {
    free: isWaived(settings.chargingFrom, kampalaDay(now)),
    payerWords: PAYER_WORDS[payer.type],
    today: money(sum(startOfKampalaDay(now))),
    month: money(monthTotal),
    cap:
      payer.type === "company"
        ? null
        : {
            limit: money(settings.monthlyCapUsd),
            reached: capReached(payer, monthTotal, settings.monthlyCapUsd),
            resumes: startOfNextKampalaMonth(now).toLocaleDateString("en-UG", { timeZone: "Africa/Kampala", dateStyle: "long" }),
          },
    months: [...byMonth].map(([key, usd]) => ({ label: monthName(key), amount: money(usd) })),
    recent: rows.slice(0, 20).map((r) => ({ at: when(r.created_at), amount: money(Number(r.charge_usd)) })),
  };
}

// ---------- The chat ----------

export interface PanelMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  createdAt: string;
}

async function history(person: Person, limit: number): Promise<PanelMessage[]> {
  const rows = must(
    await createAdminClient()
      .from("assistant_messages")
      .select("id, role, body, created_at")
      .eq("person_type", person.type)
      .eq("person_id", person.id)
      .order("created_at", { ascending: false })
      .limit(limit),
  ) as { id: string; role: "user" | "assistant"; body: string; created_at: string }[];
  return rows.reverse().map((r) => ({ id: r.id, role: r.role, body: r.body, createdAt: r.created_at }));
}

async function saveMessage(person: Person, role: "user" | "assistant", body: string, page: string): Promise<PanelMessage> {
  const row = must(
    await createAdminClient()
      .from("assistant_messages")
      .insert({ person_type: person.type, person_id: person.id, role, body, page })
      .select("id, created_at")
      .single(),
  );
  return { id: row.id, role, body, createdAt: row.created_at };
}

export type PanelState =
  | { kind: "off" }
  | { kind: "no_terms" }
  | { kind: "terms"; terms: Terms; usage: UsageView }
  | { kind: "ready"; messages: PanelMessage[]; usage: UsageView };

/** Whether this person sees the Alexis button at all. */
export async function panelVisible(person: Person | null): Promise<boolean> {
  if (!person) return false;
  const settings = await panelSettings();
  return mayUsePanel(settings.panelMode, settings.testClients, person);
}

export async function panelState(person: Person, page: string): Promise<PanelState> {
  const settings = await panelSettings();
  if (!mayUsePanel(settings.panelMode, settings.testClients, person)) return { kind: "off" };
  const terms = await currentTerms();
  if (!terms) return { kind: "no_terms" };
  const usage = await usageView(person, await payerOf(person, page), settings);
  if (!(await hasAgreed(person, terms.version))) return { kind: "terms", terms, usage };
  return { kind: "ready", messages: await history(person, 50), usage };
}

function usageTool(person: Person, payer: Payer, settings: PanelSettings): AssistantTool {
  return {
    name: "get_my_usage",
    description: "The person's Alexis usage: today, this month, the monthly limit, and whether it's free for now.",
    inputSchema: z.object({}),
    run: async () => JSON.stringify(await usageView(person, payer, settings)),
  };
}

function contextFor(person: Person, page: { path: string; title: string }, payer: Payer): string {
  const where = page.title ? `"${page.title}" (${page.path})` : page.path;
  const business = payer.type === "studio" || payer.type === "vendor" || payer.type === "agent" ? ` They're working in their ${payer.type} account.` : "";
  return `Today is ${kampalaDay(new Date())}. You're talking to ${person.name}, signed in as: ${person.role}.${business} The page they have open is ${where}.`;
}

export type SendResult = { ok: true; reply: PanelMessage; usage: UsageView } | { ok: false; error: string };

/** One message from the person and Alexis's reply. Charged to the payer, waived while it's free. */
export async function send(person: Person, text: string, page: { path: string; title: string }): Promise<SendResult> {
  const body = text.trim().slice(0, MAX_MESSAGE_CHARS);
  if (!body) return { ok: false, error: "Write a message first." };
  const settings = await panelSettings();
  if (!mayUsePanel(settings.panelMode, settings.testClients, person)) return { ok: false, error: "Alexis isn't open yet." };
  const terms = await currentTerms();
  if (!terms || !(await hasAgreed(person, terms.version))) return { ok: false, error: "Agree to the terms first." };

  const payer = await payerOf(person, page.path);
  if (capReached(payer, await chargedThisMonth(payer), settings.monthlyCapUsd)) {
    const resumes = startOfNextKampalaMonth(new Date()).toLocaleDateString("en-UG", { timeZone: "Africa/Kampala", dateStyle: "long" });
    return { ok: false, error: `You've used this month's Alexis limit. It opens again on ${resumes}.` };
  }
  if ((await spentToday()) >= settings.dailyCapUsd) return { ok: false, error: "Alexis is resting until tomorrow. Try again then." };
  const model = findModel(settings.model);
  if (!model) return { ok: false, error: "Alexis isn't set up yet." };

  const earlier = await history(person, PANEL_HISTORY);
  await saveMessage(person, "user", body, page.path);

  let totals: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let reply: string | null = null;
  let failure: string | null = null;
  try {
    const answered = await askModel({
      model,
      system: PANEL_PROMPT,
      context: contextFor(person, page, payer),
      tools: [usageTool(person, payer, settings)],
      messages: [...earlier.map((m) => ({ role: m.role, content: m.body })), { role: "user" as const, content: body }],
      onUsage: (u) => {
        totals = u;
      },
    });
    reply = answered.refused ? null : answered.text;
    if (!reply) failure = answered.refused ? "The AI declined to answer." : "The AI gave no reply.";
  } catch (err) {
    failure = err instanceof Error ? err.message : "The AI couldn't be reached.";
    console.error("alexis panel failed:", person.type, person.id, err);
  }

  const cost = costUsd(model, totals);
  must(
    await createAdminClient().from("assistant_runs").insert({
      reply,
      error: failure,
      input_tokens: totals.input,
      output_tokens: totals.output,
      cache_read_tokens: totals.cacheRead,
      cache_write_tokens: totals.cacheWrite,
      cost_usd: cost,
      person_type: person.type,
      person_id: person.id,
      payer_type: payer.type,
      payer_id: payer.id,
      multiplier: settings.multiplier,
      charge_usd: chargeFor(cost, settings.multiplier),
      waived: isWaived(settings.chargingFrom, kampalaDay(new Date())),
    }),
  );

  if (!reply) return { ok: false, error: "Sorry, Alexis couldn't answer just now. Try again in a moment." };
  return { ok: true, reply: await saveMessage(person, "assistant", reply, page.path), usage: await usageView(person, payer, settings) };
}

// ---------- The boss's view ----------

export interface PayerUsage {
  label: string;
  kind: PayerType;
  replies: number;
  costUsd: number;
  chargeUsd: number;
}

/** This month, by payer, with names. */
export async function usageByPayer(): Promise<PayerUsage[]> {
  const db = createAdminClient();
  const rows = must(await db.rpc("assistant_usage_by_payer", { p_since: startOfKampalaMonth(new Date()).toISOString() })) as {
    payer_type: PayerType;
    payer_id: string | null;
    replies: number;
    cost_usd: number;
    charge_usd: number;
  }[];
  const ids = (type: PayerType) => rows.filter((r) => r.payer_type === type && r.payer_id).map((r) => r.payer_id!);
  const [clients, studios, vendorRows, agents] = await Promise.all([
    ids("client").length ? db.from("clients").select("id, name").in("id", ids("client")) : { data: [], error: null },
    ids("studio").length ? db.from("tenants").select("id, name").in("id", ids("studio")) : { data: [], error: null },
    ids("vendor").length ? db.from("vendors").select("id, name").in("id", ids("vendor")) : { data: [], error: null },
    ids("agent").length ? db.from("agents").select("id, name").in("id", ids("agent")) : { data: [], error: null },
  ]);
  const names = new Map<string, string>();
  for (const res of [clients, studios, vendorRows, agents]) for (const r of must(res) as { id: string; name: string }[]) names.set(r.id, r.name);
  return rows.map((r) => ({
    label: r.payer_type === "company" ? "Aming (staff)" : (names.get(r.payer_id ?? "") ?? "Unknown"),
    kind: r.payer_type,
    replies: Number(r.replies),
    costUsd: Number(r.cost_usd),
    chargeUsd: Number(r.charge_usd),
  }));
}

export async function savePanelSettings(s: { panelMode: AssistantMode; multiplier: number; monthlyCapUsd: number }): Promise<void> {
  must(
    await createAdminClient()
      .from("assistant_settings")
      .update({ panel_mode: s.panelMode, charge_multiplier: s.multiplier, monthly_cap_usd: s.monthlyCapUsd, updated_at: new Date().toISOString() })
      .eq("id", true),
  );
}
