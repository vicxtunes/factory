import "server-only";

// Leads (owner, 2026-11-27): people who write to a business from its page
// ("Message us"), and later from its ads, stay inside Aming. Writing signs
// their phone in to the business's page (a new number becomes the business's
// client, as Book now does), opens their chat in Messages (./server.ts), and
// starts a lead the business follows in My Business → Leads.
//
// New / Talking / Booked follow from the chat and the client's bookings
// (./core.ts leadStatus); Lost is the business's own word.
//
// While nobody on the team has answered for a few minutes, the business's
// assistant answers from its page's facts (packages/lib/business-chat), on
// Pro's chat allowance, at most a few times in a row.
// Table: supabase/migrations/20270130100000_business_leads.sql.

import { z } from "zod";

import { costUsd, findModel, type TokenUsage } from "@repo/lib/assistant/core/rules";
import { hasAiKey, panelSettings } from "@repo/lib/assistant/panel/server";
import { askModel } from "@repo/lib/assistant/server/providers";
import { spentToday } from "@repo/lib/assistant/server/store";
import { BUSINESS_CHAT_PROMPT, BUSINESS_DAILY, BUSINESS_MONTHLY_USD, cleanTurns, factsText, type ChatTurn } from "@repo/lib/business-chat/core";
import { businessChatOn, businessSpend, pageFacts, tellIfLimitReached } from "@repo/lib/business-chat/server";
import { invoices, invoiceUrl, quotations, quotationUrl } from "@repo/lib/billing/server";
import { customers } from "@repo/lib/customers/server";
import { parsePhone } from "@repo/lib/kernel/core/phone";
import { portal, portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";
import type { PortalSession } from "@repo/lib/studio-portal/core";
import { studioScope } from "@repo/lib/studios/core";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { formatAmount } from "@repo/lib/tenancy/format";

import { leadStatus, type ChatDocument, type LeadRow, type LeadView } from "./core";
import { BizChatError, messagesOn, ring, send, tell, upsertChat, type ChatRow, type Viewer } from "./server";

const db = () => createAdminClient();

/** A business's new leads a day, so a form can't flood its clients. */
const LEADS_DAILY = 300;
/** A lead stays the same lead while it's open this long; writing again after that starts a new one. */
const LEAD_DAYS = 60;
/** Minutes without an answer from the team before the assistant answers. */
export const ASSISTANT_AFTER_MINUTES = 5;
/** The assistant's answers in a row, with nobody from the team in between. */
const ASSISTANT_IN_A_ROW = 4;
const BOOKED = ["tentative", "confirmed", "completed"];

// ── Starting one, from the business's page ───────────────────────────────

export const startLeadSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Keep your name under 80 characters."),
  phone: z
    .string()
    .trim()
    .min(1, "Enter your phone number.")
    .transform((v, ctx) => {
      const phone = parsePhone(v);
      if (phone.ok) return phone.store;
      ctx.addIssue({ code: "custom", message: phone.error });
      return z.NEVER;
    }),
  message: z.string().trim().min(1, "Write your message.").max(1000, "Keep it under 1,000 letters."),
  via: z.enum(["page", "ad"]).default("page"),
  ad: z.string().trim().max(120).optional(),
});

/**
 * Someone writes from the business's page. Their phone is signed in to the
 * page (a new number becomes the business's client), the message goes to their
 * chat, and a lead starts unless one is open. Returns the session to set and the chat.
 */
export async function startLead(slug: string, raw: unknown): Promise<{ session: PortalSession | null; chatId: string; slug: string }> {
  const at = await studioAtSlug(slug.slice(0, 80));
  if (!at) throw new BizChatError("This business isn't here any more.");
  const pageSlug = at.redirectTo ?? slug;
  if (!(await messagesOn(at.studio.id))) throw new BizChatError("This business doesn't take messages here yet.");
  const parsed = startLeadSchema.safeParse(raw);
  if (!parsed.success) throw new BizChatError(parsed.error.issues[0]?.message ?? "Check your details.");
  const input = parsed.data;

  // Already signed in on this page: they're the business's client; the message goes to their chat.
  const signedIn = await portalClient(at.studio.id);
  if (signedIn) {
    const chatId = await upsertChat(at.studio.id, signedIn.customerId, null);
    await send({ side: "customer", studio: at.studio, customerId: signedIn.customerId, name: signedIn.name, slug: pageSlug }, chatId, { body: input.message });
    return { session: null, chatId, slug: pageSlug };
  }

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db().from("business_leads").select("id", { count: "exact", head: true }).eq("tenant_id", at.studio.id).gte("created_at", since);
  if ((count ?? 0) >= LEADS_DAILY) throw new BizChatError("This business has a lot of messages today. Call or WhatsApp them instead.");

  const outcome = await customers.create(at.scope, { name: input.name, phone: input.phone, email: null, notes: null });
  const isNew = "saved" in outcome;
  const customer = "saved" in outcome ? outcome.saved : outcome.duplicateOf;
  // A number the business already has signs in by itself on its page (studio-portal: signIn), so writing does too.
  const session = await portal.openDevice(at.studio.id, customer.id);
  const chatId = await upsertChat(at.studio.id, customer.id, null);
  await send({ side: "customer", studio: at.studio, customerId: customer.id, name: customer.name, slug: pageSlug }, chatId, { body: input.message });

  const openSince = new Date(Date.now() - LEAD_DAYS * 86_400_000).toISOString();
  const { data: open } = await db().from("business_leads").select("id").eq("tenant_id", at.studio.id).eq("customer_id", customer.id).is("lost_at", null).gte("created_at", openSince).limit(1);
  if (!open?.length) {
    const { error } = await db()
      .from("business_leads")
      .insert({ tenant_id: at.studio.id, customer_id: customer.id, chat_id: chatId, source: input.via, ad_ref: input.via === "ad" ? (input.ad ?? null) : null, is_new: isNew });
    if (error) console.error("leads: couldn't record the lead:", error.message);
  }
  return { session, chatId, slug: pageSlug };
}

// ── The business's list ──────────────────────────────────────────────────

type LeadDbRow = { id: string; customer_id: string; chat_id: string; source: "page" | "ad"; is_new: boolean; lost_at: string | null; created_at: string };
const LEAD_COLUMNS = "id, customer_id, chat_id, source, is_new, lost_at, created_at";

/** Long id lists go in pieces: a request's address has a length limit. */
async function inChunks<T>(ids: string[], fetch: (part: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) out.push(...((await fetch(ids.slice(i, i + 100))).data ?? []));
  return out;
}

/** Each lead's status: answered by the team in its chat since it started, and booked since. */
async function statuses(tenantId: string, leads: LeadDbRow[]): Promise<Map<string, LeadView>> {
  if (!leads.length) return new Map();
  const chatIds = [...new Set(leads.map((l) => l.chat_id))];
  const customerIds = [...new Set(leads.map((l) => l.customer_id))];
  const [answers, bookings] = await Promise.all([
    inChunks<{ chat_id: string; created_at: string }>(chatIds, (part) =>
      db().from("business_chat_messages").select("chat_id, created_at").in("chat_id", part).eq("from_side", "business").eq("by_assistant", false).is("deleted_at", null).order("created_at", { ascending: false }).limit(2000),
    ),
    inChunks<{ customer_id: string; created_at: string }>(customerIds, (part) => db().from("bookings").select("customer_id, created_at").eq("tenant_id", tenantId).in("customer_id", part).in("status", BOOKED)),
  ]);
  const lastAnswer = new Map<string, string>();
  for (const a of answers) if (!lastAnswer.has(a.chat_id) || a.created_at > lastAnswer.get(a.chat_id)!) lastAnswer.set(a.chat_id, a.created_at);
  const lastBooking = new Map<string, string>();
  for (const b of bookings) if (!lastBooking.has(b.customer_id) || b.created_at > lastBooking.get(b.customer_id)!) lastBooking.set(b.customer_id, b.created_at);
  return new Map(
    leads.map((l) => [
      l.id,
      {
        id: l.id,
        source: l.source,
        status: leadStatus({ lostAt: l.lost_at, bookedSince: (lastBooking.get(l.customer_id) ?? "") >= l.created_at, answered: (lastAnswer.get(l.chat_id) ?? "") >= l.created_at }),
      },
    ]),
  );
}

/** For the business's chat list: each chat's latest lead. */
export async function leadsOfChats(tenantId: string, chatIds: string[]): Promise<Map<string, LeadView>> {
  if (!chatIds.length) return new Map();
  const rows = await inChunks<LeadDbRow>(chatIds, (part) => db().from("business_leads").select(LEAD_COLUMNS).eq("tenant_id", tenantId).in("chat_id", part).order("created_at", { ascending: false }));
  const latest = new Map<string, LeadDbRow>();
  for (const r of rows) if (!latest.has(r.chat_id)) latest.set(r.chat_id, r);
  const views = await statuses(tenantId, [...latest.values()]);
  return new Map([...latest.values()].map((r) => [r.chat_id, views.get(r.id)!]));
}

/** The business's leads, newest first. */
export async function listLeads(v: Viewer & { side: "business" }): Promise<LeadRow[]> {
  const { data, error } = await db().from("business_leads").select(LEAD_COLUMNS).eq("tenant_id", v.studio.id).order("created_at", { ascending: false }).limit(500).returns<LeadDbRow[]>();
  if (error) throw new Error(`leads: ${error.message}`);
  if (!data.length) return [];
  const [views, people, chats] = await Promise.all([
    statuses(v.studio.id, data),
    inChunks<{ id: string; name: string; phone: string | null }>([...new Set(data.map((l) => l.customer_id))], (part) => db().from("customers").select("id, name, phone").in("id", part)),
    inChunks<Pick<ChatRow, "id" | "last_message_at" | "last_preview" | "last_from" | "business_read_at">>([...new Set(data.map((l) => l.chat_id))], (part) =>
      db().from("business_chats").select("id, last_message_at, last_preview, last_from, business_read_at").in("id", part),
    ),
  ]);
  const person = new Map(people.map((p) => [p.id, p]));
  const chat = new Map(chats.map((c) => [c.id, c]));
  return data.map((l) => {
    const c = chat.get(l.chat_id);
    return {
      ...views.get(l.id)!,
      chatId: l.chat_id,
      customerId: l.customer_id,
      name: person.get(l.customer_id)?.name ?? "Client",
      phone: person.get(l.customer_id)?.phone ?? null,
      isNew: l.is_new,
      createdAt: l.created_at,
      lastPreview: c?.last_preview ?? null,
      lastMessageAt: c?.last_message_at ?? null,
      waiting: !!c && c.last_from === "customer" && !!c.last_message_at && (!c.business_read_at || c.last_message_at > c.business_read_at),
    };
  });
}

/** The business marks a lead lost, or takes it back. */
export async function setLeadLost(v: Viewer & { side: "business" }, leadId: unknown, lost: boolean): Promise<void> {
  if (typeof leadId !== "string" || !/^[0-9a-f-]{36}$/.test(leadId)) throw new BizChatError("That lead isn't here.");
  const { data, error } = await db().from("business_leads").update({ lost_at: lost ? new Date().toISOString() : null }).eq("id", leadId).eq("tenant_id", v.studio.id).select("id");
  if (error) throw new Error(`leads: ${error.message}`);
  if (!data?.length) throw new BizChatError("That lead isn't here.");
}

/** Whether the assistant answers this business's leads while the team is away. */
export async function leadAssistantOn(tenantId: string): Promise<boolean> {
  const { data } = await db().from("tenants").select("leads_assistant").eq("id", tenantId).maybeSingle<{ leads_assistant: boolean }>();
  return data?.leads_assistant ?? true;
}

export async function setLeadAssistant(v: Viewer & { side: "business" }, on: boolean): Promise<void> {
  const { error } = await db().from("tenants").update({ leads_assistant: on }).eq("id", v.studio.id);
  if (error) throw new Error(`leads: ${error.message}`);
}

// ── The assistant, while the team is away ────────────────────────────────

const LEAD_PROMPT = `${BUSINESS_CHAT_PROMPT}

Here you are answering in the business's own chat with this person, because nobody from its team has replied for a few minutes. They see your answer marked as the business's assistant. When they need something only the team can give (to confirm a date, a custom price, a discount, a change), say the team will reply here soon. Don't ask for their phone number: the business has it already.`;

type MessageLite = { from_side: "business" | "customer"; body: string; attachments: { kind: string }[]; by_assistant: boolean; deleted_at: string | null };

/** The chat as the model sees it: theirs as the visitor's, the business's as its own. */
function turnsOf(rows: MessageLite[]): ChatTurn[] {
  const turns = rows
    .filter((r) => !r.deleted_at)
    .map((r) => ({ role: r.from_side === "customer" ? ("user" as const) : ("assistant" as const), content: r.body.trim() || (r.attachments[0]?.kind === "audio" ? "[voice message]" : r.attachments.length ? "[a photo or file]" : "") }));
  // Several in a row from the same side read as one.
  const merged: ChatTurn[] = [];
  for (const t of turns) {
    const last = merged[merged.length - 1];
    if (last?.role === t.role) last.content = `${last.content}\n${t.content}`.slice(-500);
    else merged.push({ ...t });
  }
  return cleanTurns(merged);
}

/**
 * Every minute (apps/client/instrumentation-node.ts): leads' chats whose last
 * message is the person's, unanswered for a few minutes, get the assistant's
 * answer. Each waiting message is tried once (its run is recorded either way).
 */
export async function runLeadAssistant(now = new Date()): Promise<void> {
  const waitingSince = new Date(now.getTime() - ASSISTANT_AFTER_MINUTES * 60_000).toISOString();
  const { data: waiting } = await db()
    .from("business_chats")
    .select("id, tenant_id, customer_id, project_id, last_message_at, last_preview, last_from, business_read_at, customer_read_at")
    .eq("last_from", "customer")
    .is("project_id", null)
    .lt("last_message_at", waitingSince)
    .gt("last_message_at", new Date(now.getTime() - 86_400_000).toISOString())
    .order("last_message_at")
    .limit(30)
    .returns<ChatRow[]>();
  if (!waiting?.length) return;
  const { data: leads } = await db()
    .from("business_leads")
    .select("chat_id")
    .in("chat_id", waiting.map((c) => c.id))
    .is("lost_at", null)
    .gte("created_at", new Date(now.getTime() - LEAD_DAYS * 86_400_000).toISOString())
    .returns<{ chat_id: string }[]>();
  const leadChats = new Set((leads ?? []).map((l) => l.chat_id));
  for (const chat of waiting) {
    if (!leadChats.has(chat.id)) continue;
    try {
      await answerLead(chat);
    } catch (err) {
      console.error("leads: the assistant failed on a chat:", chat.id, err);
    }
  }
}

async function answerLead(chat: ChatRow): Promise<void> {
  const visitor = `lead:${chat.id}`;
  // Tried already for this message (answered or not).
  const { count: tried } = await db().from("assistant_runs").select("id", { count: "exact", head: true }).eq("visitor", visitor).gte("created_at", chat.last_message_at!);
  if (tried) return;
  if (!(await leadAssistantOn(chat.tenant_id)) || !(await messagesOn(chat.tenant_id)) || !(await businessChatOn(chat.tenant_id))) return;

  const { data: recent } = await db()
    .from("business_chat_messages")
    .select("from_side, body, attachments, by_assistant, deleted_at")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: false })
    .limit(16)
    .returns<MessageLite[]>();
  const rows = (recent ?? []).reverse();
  // Not again and again: once the team has been quiet for a few answers, the person waits for them.
  let inARow = 0;
  for (const r of [...rows].reverse()) {
    if (r.from_side !== "business") continue;
    if (!r.by_assistant) break;
    inARow++;
  }
  if (inARow >= ASSISTANT_IN_A_ROW) return;
  const messages = turnsOf(rows);
  if (!messages.length) return;

  const settings = await panelSettings();
  const model = findModel(settings.model);
  if (!model || !hasAiKey(model.provider)) return;
  if ((await spentToday()) >= settings.dailyCapUsd) return;
  const spend = await businessSpend(chat.tenant_id);
  if (spend.today >= BUSINESS_DAILY || spend.monthUsd >= BUSINESS_MONTHLY_USD) return;

  const slug = await portal.currentSlug(chat.tenant_id);
  const at = slug ? await studioAtSlug(slug) : null;
  if (!at || !slug) return;
  const facts = await pageFacts(at.studio, at.scope, slug);

  let totals: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let reply: string | null = null;
  let failure: string | null = null;
  try {
    const answered = await askModel({
      model,
      system: LEAD_PROMPT,
      context: factsText(facts),
      tools: [],
      messages,
      maxTokens: 1000,
      onUsage: (u) => {
        totals = u;
      },
    });
    reply = answered.refused || !answered.text ? null : answered.text.trim().slice(0, 2000);
    if (!reply) failure = answered.refused ? "The AI declined to answer." : "The AI gave no reply.";
  } catch (err) {
    failure = err instanceof Error ? err.message : "The AI couldn't be reached.";
  }
  const cost = costUsd(model, totals);
  await db().from("assistant_runs").insert({
    reply,
    error: failure,
    actions: ["Lead answer"],
    input_tokens: totals.input,
    output_tokens: totals.output,
    cache_read_tokens: totals.cacheRead,
    cache_write_tokens: totals.cacheWrite,
    cost_usd: cost,
    payer_type: "studio",
    payer_id: chat.tenant_id,
    multiplier: 1,
    // Part of Pro: Aming pays.
    charge_usd: 0,
    waived: true,
    visitor,
  });
  await tellIfLimitReached(at.studio, spend.today + 1, spend.monthUsd, spend.monthUsd + cost);
  if (!reply) return;

  // Someone from the team answered while it was thinking: theirs stands.
  const { data: still } = await db().from("business_chats").select("last_from, last_message_at").eq("id", chat.id).maybeSingle<{ last_from: string | null; last_message_at: string | null }>();
  if (still?.last_from !== "customer") return;

  const { data: row, error } = await db()
    .from("business_chat_messages")
    .insert({ chat_id: chat.id, from_side: "business", sender_name: "Alexis (assistant)", sender_client_id: null, body: reply, attachments: [], by_assistant: true })
    .select("created_at")
    .single<{ created_at: string }>();
  if (error || !row) throw new Error(`leads: couldn't post the answer: ${error?.message}`);
  // The lead stays New in Leads until someone from the team answers.
  await db().from("business_chats").update({ last_message_at: row.created_at, last_preview: reply.slice(0, 140), last_from: "business" }).eq("id", chat.id);
  await ring(chat);
  const as: Viewer = { side: "business", studio: at.studio, clientId: "", name: "Alexis (assistant)" };
  await tell(as, chat, reply.slice(0, 140));
}

// ── Quotations and invoices into the chat ────────────────────────────────

/** The chat's client's quotations and invoices that are still worth sending: open ones, newest first. */
export async function documentsFor(v: Viewer & { side: "business" }, chatId: unknown): Promise<{ customerId: string; documents: ChatDocument[] }> {
  const chat = await chatOf(v, chatId);
  const scope = studioScope(v.studio);
  const [qs, is] = await Promise.all([quotations.list(scope, chat.customer_id), invoices.list(scope, chat.customer_id)]);
  const dated: (ChatDocument & { issuedAt: string })[] = [
    ...qs.filter((q) => q.status !== "declined" && q.status !== "expired").map((q) => ({ kind: "quotation" as const, id: q.id, number: q.number, total: formatAmount(scope, q.total), status: q.status, issuedAt: q.issuedAt })),
    ...is.filter((i) => i.status !== "void" && i.balance > 0).map((i) => ({ kind: "invoice" as const, id: i.id, number: i.number, total: formatAmount(scope, i.balance), status: i.status, issuedAt: i.issuedAt })),
  ];
  const documents: ChatDocument[] = dated.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).slice(0, 20);
  return { customerId: chat.customer_id, documents };
}

/** Sends a quotation's or invoice's link in the chat, as the business's person. */
export async function sendDocument(v: Viewer & { side: "business" }, chatId: unknown, kind: unknown, id: unknown) {
  const chat = await chatOf(v, chatId);
  const scope = studioScope(v.studio);
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) throw new BizChatError("That document isn't here.");
  let body: string;
  if (kind === "quotation") {
    const q = await quotations.get(scope, id);
    if (!q || q.customerId !== chat.customer_id) throw new BizChatError("That quotation isn't this client's.");
    body = `Quotation ${q.number} · ${formatAmount(scope, q.total)}\nLook, accept and pay here: ${quotationUrl(q.shareToken)}`;
  } else if (kind === "invoice") {
    const i = await invoices.get(scope, id);
    if (!i || i.customerId !== chat.customer_id) throw new BizChatError("That invoice isn't this client's.");
    body = `Invoice ${i.number} · ${formatAmount(scope, i.balance)} to pay\nLook and pay here: ${invoiceUrl(i.shareToken)}`;
  } else throw new BizChatError("Pick a quotation or an invoice.");
  return send(v, chat.id, { body });
}

async function chatOf(v: Viewer & { side: "business" }, chatId: unknown): Promise<{ id: string; customer_id: string }> {
  if (typeof chatId !== "string" || !/^[0-9a-f-]{36}$/.test(chatId)) throw new BizChatError("That chat isn't here.");
  const { data } = await db().from("business_chats").select("id, customer_id").eq("id", chatId).eq("tenant_id", v.studio.id).maybeSingle<{ id: string; customer_id: string }>();
  if (!data) throw new BizChatError("That chat isn't here.");
  return data;
}
