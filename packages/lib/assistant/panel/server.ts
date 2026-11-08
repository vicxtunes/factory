import "server-only";

import { z } from "zod";

import { agentOfClient } from "@repo/lib/agents/server";
import { getClientSession, getDashboardSession, getDesignerSession, getWorkerSession } from "@repo/lib/auth/session";
import { clientCurrency } from "@repo/lib/currency/server";
import { BASE_CURRENCY, formatIn, type DisplayCurrency } from "@repo/lib/currency/format";
import { studioOfCaller } from "@repo/lib/studios/server";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { SUPPORT_OWNER_EMAIL } from "@repo/lib/support/constants";
import { isManagerRole, type AppRole } from "@repo/lib/types";
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
  isAppPath,
  MAX_MESSAGE_CHARS,
  MAX_MESSAGES_PER_10_MIN,
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
import { MAX_GUIDE_STEPS, readTool, type ChangeOutcome, type ChangeTool, type GuideStep, type PageLink, type ReplyWidget, type Toolbox } from "./toolbox";

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
  /** Once confirmed, the files the person attached upload to this order item from their device. */
  uploadItemId: string | null;
}

export interface PanelMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  createdAt: string;
  actions: ActionCard[];
  guide: GuideStep[] | null;
  /** Names of the files the person attached to this message (the files stay on their device). */
  files: string[];
  /** Answers to tap, product photos, and things to use (the logo uploader), under a reply. */
  choices: string[];
  images: { url: string; name: string }[];
  widgets: ReplyWidget[];
}

export interface ChatSummary {
  id: string;
  title: string;
  lastAt: string;
}

interface MessageExtras {
  actions?: string[];
  guide?: GuideStep[];
  files?: string[];
  choices?: string[];
  images?: { url: string; name: string }[];
  widgets?: ReplyWidget[];
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
  upload_item_id: string | null;
  chat_id: string | null;
}

const ACTION_COLUMNS = "id, person_type, person_id, tool, input, title, lines, status, result, expires_at, upload_item_id, chat_id";
export const MAX_ATTACHED_FILES = 30;

function toCard(row: ActionRow): ActionCard {
  return {
    id: row.id,
    title: row.title,
    lines: row.lines,
    status: row.status,
    result: row.result,
    expired: row.status === "pending" && Date.parse(row.expires_at) <= Date.now(),
    uploadItemId: row.upload_item_id,
  };
}

/** What the AI reads for a message: its words, and the names of any files attached. */
function forModel(m: PanelMessage): string {
  return m.files.length ? `${m.body}\n[Attached from their device, not yet uploaded: ${m.files.join(", ")}]` : m.body;
}

/** This person's chats, newest first; with `search`, those whose title or messages contain it. */
export async function chatsOf(person: Person, search = ""): Promise<ChatSummary[]> {
  const db = createAdminClient();
  const q = search.replace(/[%_\\]/g, " ").trim().slice(0, 60);
  let ids: string[] | null = null;
  if (q) {
    const hits = must(
      await db.from("assistant_messages").select("chat_id").eq("person_type", person.type).eq("person_id", person.id).ilike("body", `%${q}%`).limit(200),
    ) as { chat_id: string }[];
    ids = [...new Set(hits.map((h) => h.chat_id))];
  }
  let query = db.from("assistant_chats").select("id, title, last_at").eq("person_type", person.type).eq("person_id", person.id);
  if (q) query = query.or(`title.ilike.%${q.replace(/[,()]/g, " ")}%${ids?.length ? `,id.in.(${ids.join(",")})` : ""}`);
  const rows = must(await query.order("last_at", { ascending: false }).limit(50)) as { id: string; title: string; last_at: string }[];
  return rows.map((r) => ({ id: r.id, title: r.title, lastAt: r.last_at }));
}

/** What this person wrote in the last 10 minutes, everywhere. */
async function recentMessages(person: Person): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("assistant_messages")
    .select("id", { count: "exact", head: true })
    .eq("person_type", person.type)
    .eq("person_id", person.id)
    .eq("role", "user")
    .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function ownChat(person: Person, chatId: string): Promise<boolean> {
  const { count, error } = await createAdminClient()
    .from("assistant_chats")
    .select("id", { count: "exact", head: true })
    .eq("id", chatId)
    .eq("person_type", person.type)
    .eq("person_id", person.id);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

async function history(chatId: string, limit: number): Promise<PanelMessage[]> {
  const db = createAdminClient();
  const rows = must(
    await db.from("assistant_messages").select("id, role, body, created_at, extras").eq("chat_id", chatId).order("created_at", { ascending: false }).limit(limit),
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
    files: r.extras?.files ?? [],
    choices: r.extras?.choices ?? [],
    images: r.extras?.images ?? [],
    widgets: r.extras?.widgets ?? [],
  }));
}

/** A chat's messages, if it's this person's. */
export async function chatMessages(person: Person, chatId: string): Promise<PanelMessage[] | null> {
  return (await ownChat(person, chatId)) ? history(chatId, 100) : null;
}

async function newChat(person: Person, title: string): Promise<string> {
  const row = must(
    await createAdminClient()
      .from("assistant_chats")
      .insert({ person_type: person.type, person_id: person.id, title: title.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat" })
      .select("id")
      .single(),
  );
  return row.id;
}

/** WhatsApp is one ongoing chat, named WhatsApp. */
async function whatsAppChat(person: Person): Promise<string> {
  const found = must(
    await createAdminClient().from("assistant_chats").select("id").eq("person_type", person.type).eq("person_id", person.id).eq("title", "WhatsApp").limit(1),
  ) as { id: string }[];
  return found[0]?.id ?? newChat(person, "WhatsApp");
}

async function saveMessage(
  person: Person,
  chatId: string,
  role: "user" | "assistant",
  body: string,
  page: string,
  channel: "app" | "whatsapp",
  extras: MessageExtras | null = null,
): Promise<PanelMessage> {
  const db = createAdminClient();
  const row = must(
    await db.from("assistant_messages").insert({ chat_id: chatId, person_type: person.type, person_id: person.id, role, body, page, channel, extras }).select("id, created_at").single(),
  );
  must(await db.from("assistant_chats").update({ last_at: row.created_at }).eq("id", chatId));
  return {
    id: row.id,
    role,
    body,
    createdAt: row.created_at,
    actions: [],
    guide: extras?.guide ?? null,
    files: extras?.files ?? [],
    choices: extras?.choices ?? [],
    images: extras?.images ?? [],
    widgets: extras?.widgets ?? [],
  };
}

export type PanelState =
  | { kind: "off" }
  | { kind: "no_terms" }
  | { kind: "terms"; terms: Terms; usage: UsageView }
  | {
      kind: "ready";
      /** For the welcome: "Welcome back, Sarah!" */
      firstName: string;
      suggestions: string[];
      /** Whether this person can attach files (to add them to an order). */
      canAttach: boolean;
      chats: ChatSummary[];
      chatId: string | null;
      messages: PanelMessage[];
      usage: UsageView;
    };

/** Whether this person sees the Alexis button at all. */
export async function panelVisible(person: Person | null): Promise<boolean> {
  if (!person) return false;
  const settings = await panelSettings();
  return mayUsePanel(settings.panelMode, settings.testClients, person);
}

/** What Alexis shows this person: off, terms to agree to, or their chats, with the newest open (or `chatId`). */
export async function panelState(person: Person, page: string, chatId?: string | null): Promise<PanelState> {
  const settings = await panelSettings();
  if (!mayUsePanel(settings.panelMode, settings.testClients, person)) return { kind: "off" };
  const terms = await currentTerms();
  if (!terms) return { kind: "no_terms" };
  const usage = await usageView(person, await payerOf(person, page), settings);
  if (!(await hasAgreed(person, terms.version))) return { kind: "terms", terms, usage };
  const chats = await chatsOf(person);
  const open = chatId === null ? null : chatId && chats.some((c) => c.id === chatId) ? chatId : (chats[0]?.id ?? null);
  return {
    kind: "ready",
    firstName: person.name.trim().split(/\s+/)[0] || person.name,
    suggestions: suggestionsFor(person, page),
    canAttach: person.type === "client" || (person.type === "staff" && isManagerRole(person.role as AppRole)),
    chats,
    chatId: open,
    messages: open ? await history(open, 100) : [],
    usage,
  };
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
/** Added to every change tool's description: what Alexis is told a change tool does. */
export const PREPARES_ONLY = " This only prepares the change: the person sees it on a card and must tap Confirm.";
export const PREPARED_REPLY = "Shown to the person as a card with Confirm and Cancel. Nothing has changed yet: ask them to check the card and tap Confirm. Never say it's done.";
const ACTION_LIFETIME_MS = 15 * 60_000;

/** Each change tool as Alexis sees it: it prepares a card and stops there. */
function preparingTool(t: ChangeTool, person: Person, chatId: string, prepared: string[], attached: number): AssistantTool {
  return {
    name: t.name,
    description: `${t.description}${PREPARES_ONLY}`,
    inputSchema: t.inputSchema,
    run: (async (input: never) => {
      if (prepared.length >= MAX_CARDS_PER_REPLY) return "Refused: prepare at most 3 changes at a time.";
      if (t.uploadsTo && !attached) return "Refused: no files are attached to their latest message. Ask them to tap Attach and choose the files.";
      let card: { title: string; lines: string[] };
      try {
        card = await t.card(input, { attached });
      } catch (err) {
        return `Refused: ${err instanceof Error ? err.message : "it can't be done."}`;
      }
      // After the card: it may settle exactly which item (it's stored with the input).
      const uploadItemId = t.uploadsTo ? t.uploadsTo(input) || null : null;
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
            upload_item_id: uploadItemId,
            chat_id: chatId,
          })
          .select("id")
          .single(),
      );
      prepared.push(row.id);
      return PREPARED_REPLY;
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
export function guideTool(page: { path: string; links: PageLink[] }, ctx: { guide: GuideStep[] | null }): AssistantTool {
  const known = new Set([page.path, ...page.links.map((l) => l.href)]);
  return readTool({
    name: "show_the_way",
    description:
      "Take the person to where something is done, step by step, like a person showing them: each step opens a page and points at the button or link to tap. Use it when they ask where something is or how to get somewhere. Only pages from the list you were given.",
    inputSchema: guideSchema,
    run: async ({ steps }) => {
      const unknown = steps.find((s) => !known.has(s.href) || !isAppPath(s.href));
      if (unknown) return `Refused: ${unknown.href} isn't a page they can open. Use one from the list.`;
      ctx.guide = steps.map((s) => ({ href: s.href, tap: s.tap?.trim() || null, say: s.say }));
      return "Shown to the person as a 'Show me' button under your reply. Tell them in one sentence what you'll show them.";
    },
  });
}

/** The second system block: who is asking, where, and what Alexis can do for them. Exported for the evaluations. */
export function contextFor(person: Person, page: { path: string; title: string; links: PageLink[] }, payer: Payer, abilities: string): string {
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

/** A tool call in a reply, for the boss's trace: what Alexis asked, what came back, how long it took. */
export interface TraceStep {
  tool: string;
  input: string;
  output: string;
  ms: number;
  ok: boolean;
}

/** Live progress while Alexis works: a tool starting, and the reply's words as they come (per step of its loop). */
export interface Listen {
  onStep?: (tool: string) => void;
  onText?: (step: number, delta: string) => void;
}

const cut = (s: string) => (s.length > 1000 ? `${s.slice(0, 1000)}…` : s);

/** The tools, each recording its call in `trace` and telling `onStep` it started. */
function traced(tools: AssistantTool[], trace: TraceStep[], onStep?: (tool: string) => void): AssistantTool[] {
  return tools.map((t) => ({
    ...t,
    run: (async (input: never) => {
      onStep?.(t.name);
      const started = Date.now();
      try {
        const output = await t.run(input);
        trace.push({ tool: t.name, input: cut(JSON.stringify(input) ?? ""), output: cut(output), ms: Date.now() - started, ok: !/^(Refused|Failed)/.test(output) });
        return output;
      } catch (err) {
        trace.push({ tool: t.name, input: cut(JSON.stringify(input) ?? ""), output: `Error: ${err instanceof Error ? err.message : "failed"}`, ms: Date.now() - started, ok: false });
        throw err;
      }
    }) as AssistantTool["run"],
  }));
}

export type SendResult =
  | { ok: true; chat: ChatSummary; mine: PanelMessage; reply: PanelMessage; usage: UsageView }
  | { ok: false; error: string };

/**
 * One message from the person and Alexis's reply, in `chatId` (null: a new chat named after the message).
 * Charged to the payer, waived while it's free. `files`: names of files attached on their device.
 */
export async function send(
  person: Person,
  chatId: string | null,
  text: string,
  page: { path: string; title: string; links: PageLink[] },
  toolbox: Toolbox,
  channel: "app" | "whatsapp" = "app",
  files: string[] = [],
  listen?: Listen,
): Promise<SendResult> {
  const body = text.trim().slice(0, MAX_MESSAGE_CHARS);
  const attached = files.map((f) => f.slice(0, 120)).slice(0, MAX_ATTACHED_FILES);
  if (!body && !attached.length) return { ok: false, error: "Write a message first." };
  const settings = await panelSettings();
  if (!mayUsePanel(settings.panelMode, settings.testClients, person)) return { ok: false, error: "Alexis isn't open yet." };
  const terms = await currentTerms();
  if (!terms || !(await hasAgreed(person, terms.version))) return { ok: false, error: "Agree to the terms first." };
  if (chatId && !(await ownChat(person, chatId))) return { ok: false, error: "That chat doesn't exist." };
  if ((await recentMessages(person)) >= MAX_MESSAGES_PER_10_MIN) return { ok: false, error: "That's a lot of messages at once. Wait a minute and try again." };

  const payer = await payerOf(person, page.path);
  if (capReached(payer, await chargedThisMonth(payer), settings.monthlyCapUsd)) {
    const resumes = startOfNextKampalaMonth(new Date()).toLocaleDateString("en-UG", { timeZone: "Africa/Kampala", dateStyle: "long" });
    return { ok: false, error: `You've used this month's Alexis limit. It opens again on ${resumes}.` };
  }
  if ((await spentToday()) >= settings.dailyCapUsd) return { ok: false, error: "Alexis is resting until tomorrow. Try again then." };
  const model = findModel(settings.model);
  if (!model) return { ok: false, error: "Alexis isn't set up yet." };
  if (!hasAiKey(model.provider)) {
    console.error(`alexis: no ${model.provider} key in this app's settings`);
    return { ok: false, error: "Alexis isn't set up in this app yet. The team has been told." };
  }

  const chat = chatId ?? (channel === "whatsapp" ? await whatsAppChat(person) : await newChat(person, body || attached.join(", ")));
  const earlier = await history(chat, PANEL_HISTORY);
  const mine = await saveMessage(person, chat, "user", body || "(files attached)", page.path, channel, attached.length ? { files: attached } : null);

  const prepared: string[] = [];
  const ctx: { guide: GuideStep[] | null } = { guide: null };
  const trace: TraceStep[] = [];
  const tools = traced(
    [
      ...toolbox.read,
      usageTool(person, payer, settings),
      ...toolbox.change.map((t) => preparingTool(t, person, chat, prepared, attached.length)),
      ...(channel === "app" ? [guideTool(page, ctx)] : []),
    ],
    trace,
    listen?.onStep,
  );

  let totals: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let reply: string | null = null;
  let failure: string | null = null;
  try {
    const answered = await askModel({
      model,
      system: PANEL_PROMPT,
      context: contextFor(person, page, payer, toolbox.abilities),
      tools,
      messages: [...earlier, mine].map((m) => ({ role: m.role, content: forModel(m) })),
      onUsage: (u) => {
        totals = u;
      },
      onText: listen?.onText,
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
      trace,
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
  const shown = toolbox.replyExtras?.() ?? { choices: [], images: [], widgets: [] };
  const widgets = shown.widgets ?? [];
  const extras: MessageExtras | null =
    prepared.length || ctx.guide || shown.choices.length || shown.images.length || widgets.length
      ? { actions: prepared, guide: ctx.guide ?? undefined, choices: shown.choices, images: shown.images, widgets }
      : null;
  const saved = await saveMessage(person, chat, "assistant", reply, page.path, channel, extras);
  const cards = prepared.length ? (must(await createAdminClient().from("assistant_pending_actions").select(ACTION_COLUMNS).in("id", prepared)) as ActionRow[]) : [];
  const summary = (await chatsOf(person)).find((c) => c.id === chat) ?? { id: chat, title: "New chat", lastAt: saved.createdAt };
  return {
    ok: true,
    chat: summary,
    mine,
    reply: { ...saved, actions: prepared.flatMap((id) => cards.filter((c) => c.id === id).map(toCard)) },
    usage: await usageView(person, payer, settings),
  };
}

export type DecideResult = { ok: true; card: ActionCard; note: PanelMessage } | { ok: false; error: string };

async function note(person: Person, row: ActionRow, words: string): Promise<PanelMessage> {
  if (row.chat_id) return saveMessage(person, row.chat_id, "assistant", words, "", "app");
  return { id: `note-${row.id}`, role: "assistant", body: words, createdAt: new Date().toISOString(), actions: [], guide: null, files: [], choices: [], images: [], widgets: [] };
}

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
      .update({
        status: result.ok ? "done" : "failed",
        result: result.ok ? result.done : result.error,
        ...(result.ok && result.uploadItemId ? { upload_item_id: result.uploadItemId } : {}),
      })
      .eq("id", id)
      .select(ACTION_COLUMNS)
      .single(),
  ) as ActionRow;
  return { ok: true, card: toCard(done), note: await note(person, row, result.ok ? `Done. ${result.done}` : `That didn't work: ${result.error}`) };
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
  return { ok: true, card: toCard(rows[0]), note: await note(person, rows[0], "Cancelled. Nothing was changed.") };
}

/** Suggestions under the welcome, for this person's role and the business they're working in. */
export function suggestionsFor(person: Person, page: string): string[] {
  const under = (root: string) => page === root || page.startsWith(`${root}/`);
  if (person.type === "designer") return ["What orders are assigned to me?", "Which of my orders are due soonest?"];
  if (person.type === "worker") return ["What's on the factory board?", "Which items are urgent?"];
  if (person.type === "client") {
    if (under("/studio")) return ["Help me set up my page", "Add a service with packages", "How much did we receive this month?", "Add a new client"];
    if (under("/agents")) return ["How much commission have I earned?", "Add a new client", "Show me how to place an order for a client"];
    if (under("/vendors")) return ["What jobs do I have?", "Show me where to accept a job"];
    return ["Where is my latest order?", "Do I owe anything?", "Add photos to my order", "Show me where to top up my wallet"];
  }
  if (person.role === "boss") return ["How much money came in today?", "Is everything OK on the server?", "Which orders are waiting for review?", "Record an expense"];
  if (person.role === "supervisor") return ["How much money came in today?", "Which orders are waiting for review?", "Record an expense", "What expenses are still owed?"];
  return ["Find an order", "Which orders are waiting for review?", "Add a new client", "Show me where to place an order"];
}

// ---------- The boss's view ----------

/** Whether this app has the key for the chosen AI (each app has its own settings: /etc/aming-<app>.env). */
export function hasAiKey(provider: "openai" | "anthropic"): boolean {
  return provider === "openai" ? !!process.env.OPENAI_API_KEY : !!process.env.ANTHROPIC_API_KEY;
}

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

export interface PanelRun {
  id: string;
  who: string;
  reply: string | null;
  error: string | null;
  costUsd: number;
  at: string;
  trace: TraceStep[];
}

/** The latest Alexis replies (not the client chats'), with each one's steps: for finding out why it did what it did. */
export async function recentPanelRuns(limit: number): Promise<PanelRun[]> {
  const db = createAdminClient();
  const rows = must(
    await db
      .from("assistant_runs")
      .select("id, person_type, person_id, reply, error, cost_usd, created_at, trace")
      .not("person_type", "is", null)
      .not("payer_type", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit),
  ) as { id: string; person_type: PersonType; person_id: string; reply: string | null; error: string | null; cost_usd: number; created_at: string; trace: TraceStep[] | null }[];
  const ids = (type: PersonType) => [...new Set(rows.filter((r) => r.person_type === type).map((r) => r.person_id))];
  const [staff, clients, designers, workers] = await Promise.all([
    ids("staff").length ? db.from("profiles").select("id, full_name").in("id", ids("staff")) : { data: [], error: null },
    ids("client").length ? db.from("clients").select("id, name").in("id", ids("client")) : { data: [], error: null },
    ids("designer").length ? db.from("designers").select("id, name").in("id", ids("designer")) : { data: [], error: null },
    ids("worker").length ? db.from("workers").select("id, name").in("id", ids("worker")) : { data: [], error: null },
  ]);
  const names = new Map<string, string>();
  for (const r of (must(staff) ?? []) as { id: string; full_name: string | null }[]) names.set(r.id, r.full_name ?? "Staff");
  for (const res of [clients, designers, workers]) for (const r of (must(res) ?? []) as { id: string; name: string }[]) names.set(r.id, r.name);
  return rows.map((r) => ({ id: r.id, who: names.get(r.person_id) ?? r.person_type, reply: r.reply, error: r.error, costUsd: Number(r.cost_usd), at: r.created_at, trace: r.trace ?? [] }));
}
