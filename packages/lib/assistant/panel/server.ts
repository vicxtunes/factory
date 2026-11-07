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
import { MAX_GUIDE_STEPS, readTool, type ChangeOutcome, type ChangeTool, type GuideStep, type PageLink, type Toolbox } from "./toolbox";

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

/** A change Alexis prepared, as its card shows it. */
export interface ActionCard {
  id: string;
  title: string;
  lines: string[];
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  result: string | null;
  expired: boolean;
}

export interface PanelMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  createdAt: string;
  actions: ActionCard[];
  guide: GuideStep[] | null;
}

interface MessageExtras {
  actions?: string[];
  guide?: GuideStep[];
}

interface ActionRow {
  id: string;
  person_type: PersonType;
  person_id: string;
  tool: string;
  input: unknown;
  title: string;
  lines: string[];
  status: ActionCard["status"];
  result: string | null;
  expires_at: string;
}

const ACTION_COLUMNS = "id, person_type, person_id, tool, input, title, lines, status, result, expires_at";

function toCard(row: ActionRow): ActionCard {
  return {
    id: row.id,
    title: row.title,
    lines: row.lines,
    status: row.status,
    result: row.result,
    expired: row.status === "pending" && Date.parse(row.expires_at) <= Date.now(),
  };
}

async function history(person: Person, limit: number): Promise<PanelMessage[]> {
  const db = createAdminClient();
  const rows = must(
    await db
      .from("assistant_messages")
      .select("id, role, body, created_at, extras")
      .eq("person_type", person.type)
      .eq("person_id", person.id)
      .order("created_at", { ascending: false })
      .limit(limit),
  ) as { id: string; role: "user" | "assistant"; body: string; created_at: string; extras: MessageExtras | null }[];
  const ids = rows.flatMap((r) => r.extras?.actions ?? []);
  const actions = ids.length ? (must(await db.from("assistant_pending_actions").select(ACTION_COLUMNS).in("id", ids)) as ActionRow[]) : [];
  const byId = new Map(actions.map((a) => [a.id, toCard(a)]));
  return rows.reverse().map((r) => ({
    id: r.id,
    role: r.role,
    body: r.body,
    createdAt: r.created_at,
    actions: (r.extras?.actions ?? []).flatMap((id) => byId.get(id) ?? []),
    guide: r.extras?.guide ?? null,
  }));
}

async function saveMessage(
  person: Person,
  role: "user" | "assistant",
  body: string,
  page: string,
  channel: "app" | "whatsapp",
  extras: MessageExtras | null = null,
): Promise<string> {
  const row = must(
    await createAdminClient()
      .from("assistant_messages")
      .insert({ person_type: person.type, person_id: person.id, role, body, page, channel, extras })
      .select("id")
      .single(),
  );
  return row.id;
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
  return readTool({
    name: "get_my_usage",
    description: "The person's Alexis usage: today, this month, the monthly limit, and whether it's free for now.",
    inputSchema: z.object({}),
    run: () => usageView(person, payer, settings),
  });
}

const MAX_CARDS_PER_REPLY = 3;
const ACTION_LIFETIME_MS = 15 * 60_000;

/** Each change tool as Alexis sees it: it prepares a card and stops there. */
function preparingTool(t: ChangeTool, person: Person, prepared: string[]): AssistantTool {
  return {
    name: t.name,
    description: `${t.description} This only prepares the change: the person sees it on a card and must tap Confirm.`,
    inputSchema: t.inputSchema,
    run: (async (input: never) => {
      if (prepared.length >= MAX_CARDS_PER_REPLY) return "Refused: prepare at most 3 changes at a time.";
      let card: { title: string; lines: string[] };
      try {
        card = await t.card(input);
      } catch (err) {
        return `Refused: ${err instanceof Error ? err.message : "it can't be done."}`;
      }
      const row = must(
        await createAdminClient()
          .from("assistant_pending_actions")
          .insert({
            person_type: person.type,
            person_id: person.id,
            person_name: person.name,
            tool: t.name,
            input,
            title: card.title.slice(0, 200),
            lines: card.lines.map((l) => l.slice(0, 300)).slice(0, 12),
            expires_at: new Date(Date.now() + ACTION_LIFETIME_MS).toISOString(),
          })
          .select("id")
          .single(),
      );
      prepared.push(row.id);
      return "Shown to the person as a card with Confirm and Cancel. Nothing has changed yet: ask them to check the card and tap Confirm. Never say it's done.";
    }) as AssistantTool["run"],
  };
}

const guideSchema = z.object({
  steps: z
    .array(
      z.object({
        href: z.string().describe("A page from the list of pages they can open, or the page they're on."),
        tap: z.string().max(60).nullable().describe("The exact words on the button or link to tap once there, or null."),
        say: z.string().max(200).describe("What this step is for, in a few words."),
      }),
    )
    .min(1)
    .max(MAX_GUIDE_STEPS),
});

/** Shows the way step by step: opens each page in turn and points at what to tap. */
function guideTool(page: { path: string; links: PageLink[] }, ctx: { guide: GuideStep[] | null }): AssistantTool {
  const known = new Set([page.path, ...page.links.map((l) => l.href)]);
  return readTool({
    name: "show_the_way",
    description:
      "Take the person to where something is done, step by step, like a person showing them: each step opens a page and points at the button or link to tap. Use it when they ask where something is or how to get somewhere. Only pages from the list you were given.",
    inputSchema: guideSchema,
    run: async ({ steps }) => {
      const unknown = steps.find((s) => !known.has(s.href));
      if (unknown) return `Refused: ${unknown.href} isn't a page they can open. Use one from the list.`;
      ctx.guide = steps.map((s) => ({ href: s.href, tap: s.tap?.trim() || null, say: s.say }));
      return "Shown to the person as a 'Show me' button under your reply. Tell them in one sentence what you'll show them.";
    },
  });
}

function contextFor(person: Person, page: { path: string; title: string; links: PageLink[] }, payer: Payer, abilities: string): string {
  const where = page.title ? `"${page.title}" (${page.path})` : page.path;
  const business = payer.type === "studio" || payer.type === "vendor" || payer.type === "agent" ? ` They're working in their ${payer.type} account.` : "";
  const lines = [
    `Today is ${kampalaDay(new Date())}. You're talking to ${person.name}, signed in as: ${person.role}.${business}`,
    page.path ? `The page they have open is ${where}.` : "They're writing on WhatsApp, not in the app.",
    `What you can do for them: ${abilities}`,
  ];
  if (page.links.length) lines.push(`Pages and links they can open from here: ${page.links.map((l) => `${l.label} (${l.href})`).join("; ")}.`);
  return lines.join("\n\n");
}

export type SendResult = { ok: true; reply: PanelMessage; usage: UsageView } | { ok: false; error: string };

/** One message from the person and Alexis's reply. Charged to the payer, waived while it's free. */
export async function send(
  person: Person,
  text: string,
  page: { path: string; title: string; links: PageLink[] },
  toolbox: Toolbox,
  channel: "app" | "whatsapp" = "app",
): Promise<SendResult> {
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
  await saveMessage(person, "user", body, page.path, channel);

  const prepared: string[] = [];
  const ctx: { guide: GuideStep[] | null } = { guide: null };
  const tools = [
    ...toolbox.read,
    usageTool(person, payer, settings),
    ...toolbox.change.map((t) => preparingTool(t, person, prepared)),
    ...(channel === "app" ? [guideTool(page, ctx)] : []),
  ];

  let totals: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let reply: string | null = null;
  let failure: string | null = null;
  try {
    const answered = await askModel({
      model,
      system: PANEL_PROMPT,
      context: contextFor(person, page, payer, toolbox.abilities),
      tools,
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
      actions: prepared.length ? [`Prepared ${prepared.length} change(s) to confirm`] : [],
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
  const extras: MessageExtras | null = prepared.length || ctx.guide ? { actions: prepared, guide: ctx.guide ?? undefined } : null;
  const id = await saveMessage(person, "assistant", reply, page.path, channel, extras);
  const saved = (await history(person, 1)).find((m) => m.id === id);
  const fallback: PanelMessage = { id, role: "assistant", body: reply, createdAt: new Date().toISOString(), actions: [], guide: ctx.guide };
  return { ok: true, reply: saved ?? fallback, usage: await usageView(person, payer, settings) };
}

export type DecideResult = { ok: true; card: ActionCard; note: PanelMessage } | { ok: false; error: string };

/** The person taps Confirm: the prepared change runs once, through the app's own function, and is recorded. */
export async function confirm(person: Person, id: string, toolbox: Toolbox): Promise<DecideResult> {
  const db = createAdminClient();
  const claimed = must(
    await db
      .from("assistant_pending_actions")
      .update({ status: "running", decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("person_type", person.type)
      .eq("person_id", person.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .select(ACTION_COLUMNS),
  ) as ActionRow[];
  const row = claimed[0];
  if (!row) return { ok: false, error: "This change has expired or was already decided. Ask Alexis again." };

  const tool = toolbox.change.find((t) => t.name === row.tool);
  const parsed = tool?.inputSchema.safeParse(row.input);
  let result: ChangeOutcome;
  if (!tool || !parsed?.success) {
    result = { ok: false, error: "You can't make this change any more." };
  } else {
    try {
      result = await tool.run(parsed.data as never);
    } catch (err) {
      console.error("alexis change failed:", row.tool, err);
      result = { ok: false, error: "Something went wrong. Nothing was changed, or check the page to be sure." };
    }
  }
  const done = must(
    await db
      .from("assistant_pending_actions")
      .update({ status: result.ok ? "done" : "failed", result: result.ok ? result.done : result.error })
      .eq("id", id)
      .select(ACTION_COLUMNS)
      .single(),
  ) as ActionRow;
  const words = result.ok ? `Done. ${result.done}` : `That didn't work: ${result.error}`;
  const noteId = await saveMessage(person, "assistant", words, "", "app");
  return { ok: true, card: toCard(done), note: { id: noteId, role: "assistant", body: words, createdAt: new Date().toISOString(), actions: [], guide: null } };
}

export async function cancel(person: Person, id: string): Promise<DecideResult> {
  const rows = must(
    await createAdminClient()
      .from("assistant_pending_actions")
      .update({ status: "cancelled", decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("person_type", person.type)
      .eq("person_id", person.id)
      .eq("status", "pending")
      .select(ACTION_COLUMNS),
  ) as ActionRow[];
  if (!rows[0]) return { ok: false, error: "This change was already decided." };
  const words = "Cancelled. Nothing was changed.";
  const noteId = await saveMessage(person, "assistant", words, "", "app");
  return { ok: true, card: toCard(rows[0]), note: { id: noteId, role: "assistant", body: words, createdAt: new Date().toISOString(), actions: [], guide: null } };
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

export interface ChangeRecord {
  id: string;
  who: string;
  title: string;
  status: ActionCard["status"];
  result: string | null;
  at: string;
}

/** Every change made through Alexis, newest first: who asked, what ran, how it went. */
export async function recentChanges(limit: number): Promise<ChangeRecord[]> {
  const rows = must(
    await createAdminClient()
      .from("assistant_pending_actions")
      .select("id, person_name, title, status, result, decided_at")
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit),
  ) as { id: string; person_name: string; title: string; status: ActionCard["status"]; result: string | null; decided_at: string | null }[];
  return rows.map((r) => ({ id: r.id, who: r.person_name, title: r.title, status: r.status, result: r.result, at: r.decided_at ?? "" }));
}

/** The boss as Alexis's person, for a channel with no app sign-in (WhatsApp). Null unless the account is still a boss. */
export async function bossById(userId: string): Promise<Person | null> {
  const row = must(await createAdminClient().from("profiles").select("role, full_name").eq("id", userId).maybeSingle()) as { role: string; full_name: string | null } | null;
  if (row?.role !== "boss") return null;
  return { type: "staff", id: userId, name: row.full_name || "Boss", role: "boss", email: null, phone: null, alwaysInTest: true };
}
