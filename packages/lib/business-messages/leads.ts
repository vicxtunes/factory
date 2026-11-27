import "server-only";

// Leads (owner, 2026-11-27): people who write to a business from its page
// ("Message us"), and later from its ads, stay inside Aming. Writing signs
// their phone in to the business's page (a new number becomes the business's
// client, as Book now does), opens their chat in Messages (./server.ts), and
// starts a lead the business follows in My Business → Leads.
//
// New → Talking → Quoted → Booked → Paid follow from the chat, the client's
// quotations, bookings and payments since the lead started (./core.ts
// leadStatus); Lost is the business's own word. Alexis sells in the lead's
// chat at once (./sales.ts).
// Tables: supabase/migrations/20270130100000_business_leads.sql, 20270131100000_lead_sales.sql.

import { z } from "zod";

import { invoices, invoiceUrl, quotations, quotationUrl } from "@repo/lib/billing/server";
import { customers } from "@repo/lib/customers/server";
import { parsePhone } from "@repo/lib/kernel/core/phone";
import { portal, portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";
import type { PortalSession } from "@repo/lib/studio-portal/core";
import { studioScope } from "@repo/lib/studios/core";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { formatAmount } from "@repo/lib/tenancy/format";

import { leadStatus, type ChatDocument, type LeadRow, type LeadStatus, type LeadView } from "./core";
import { BizChatError, messagesOn, send, upsertChat, type ChatRow, type Viewer } from "./server";

const db = () => createAdminClient();

/** A business's new leads a day, so a form can't flood its clients. */
const LEADS_DAILY = 300;
/** A lead stays the same lead while it's open this long; writing again after that starts a new one. */
const LEAD_DAYS = 60;
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

type LeadDbRow = { id: string; customer_id: string; chat_id: string; source: "page" | "ad"; is_new: boolean; lost_at: string | null; created_at: string; closed_by_assistant: boolean };
const LEAD_COLUMNS = "id, customer_id, chat_id, source, is_new, lost_at, created_at, closed_by_assistant";
type Progress = LeadView & { collected: number; closedByAssistant: boolean };

/** Long id lists go in pieces: a request's address has a length limit. */
async function inChunks<T>(ids: string[], fetch: (part: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) out.push(...((await fetch(ids.slice(i, i + 100))).data ?? []));
  return out;
}

/** Each lead's status and what it brought in: the business's answers in its chat, and the client's quotations, bookings and payments, since it started. */
async function statuses(tenantId: string, leads: LeadDbRow[]): Promise<Map<string, Progress>> {
  if (!leads.length) return new Map();
  const chatIds = [...new Set(leads.map((l) => l.chat_id))];
  const customerIds = [...new Set(leads.map((l) => l.customer_id))];
  const [answers, bookings, docs] = await Promise.all([
    inChunks<{ chat_id: string; created_at: string }>(chatIds, (part) =>
      db().from("business_chat_messages").select("chat_id, created_at").in("chat_id", part).eq("from_side", "business").is("deleted_at", null).order("created_at", { ascending: false }).limit(2000),
    ),
    inChunks<{ customer_id: string; created_at: string }>(customerIds, (part) => db().from("bookings").select("customer_id, created_at").eq("tenant_id", tenantId).in("customer_id", part).in("status", BOOKED)),
    inChunks<{ id: string; kind: string; customer_id: string; created_at: string }>(customerIds, (part) => db().from("billing_documents").select("id, kind, customer_id, created_at").eq("tenant_id", tenantId).in("customer_id", part)),
  ]);
  const invoiceOwner = new Map(docs.filter((d) => d.kind === "invoice").map((d) => [d.id, d.customer_id]));
  const payments = await inChunks<{ invoice_id: string; amount: number; created_at: string }>([...invoiceOwner.keys()], (part) =>
    db().from("billing_payments").select("invoice_id, amount, created_at").eq("tenant_id", tenantId).in("invoice_id", part).is("voided_at", null),
  );
  const latest = (rows: { key: string; at: string }[]) => {
    const m = new Map<string, string>();
    for (const r of rows) if (!m.has(r.key) || r.at > m.get(r.key)!) m.set(r.key, r.at);
    return m;
  };
  const lastAnswer = latest(answers.map((a) => ({ key: a.chat_id, at: a.created_at })));
  const lastBooking = latest(bookings.map((b) => ({ key: b.customer_id, at: b.created_at })));
  const lastQuote = latest(docs.filter((d) => d.kind === "quotation").map((d) => ({ key: d.customer_id, at: d.created_at })));
  return new Map(
    leads.map((l) => {
      const collected = payments.filter((p) => invoiceOwner.get(p.invoice_id) === l.customer_id && p.created_at >= l.created_at).reduce((sum, p) => sum + Number(p.amount), 0);
      const since = (m: Map<string, string>, key: string) => (m.get(key) ?? "") >= l.created_at;
      return [
        l.id,
        {
          id: l.id,
          source: l.source,
          status: leadStatus({ lostAt: l.lost_at, paidSince: collected > 0, bookedSince: since(lastBooking, l.customer_id), quotedSince: since(lastQuote, l.customer_id), answered: since(lastAnswer, l.chat_id) }),
          collected,
          closedByAssistant: l.closed_by_assistant,
        },
      ];
    }),
  );
}

/** For the business's chat list: each chat's latest lead. */
export async function leadsOfChats(tenantId: string, chatIds: string[]): Promise<Map<string, LeadView>> {
  if (!chatIds.length) return new Map();
  const rows = await inChunks<LeadDbRow>(chatIds, (part) => db().from("business_leads").select(LEAD_COLUMNS).eq("tenant_id", tenantId).in("chat_id", part).order("created_at", { ascending: false }));
  const latest = new Map<string, LeadDbRow>();
  for (const r of rows) if (!latest.has(r.chat_id)) latest.set(r.chat_id, r);
  const views = await statuses(tenantId, [...latest.values()]);
  return new Map(
    [...latest.values()].map((r) => {
      const { id, status, source } = views.get(r.id)!;
      return [r.chat_id, { id, status, source }];
    }),
  );
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

/** How far these leads got (for ads' results: packages/lib/ads). */
export async function leadProgress(tenantId: string, leadIds: string[]): Promise<Map<string, LeadStatus>> {
  if (!leadIds.length) return new Map();
  const rows = await inChunks<LeadDbRow>(leadIds, (part) => db().from("business_leads").select(LEAD_COLUMNS).eq("tenant_id", tenantId).in("id", part));
  const views = await statuses(tenantId, rows);
  return new Map([...views].map(([id, v]) => [id, v.status]));
}
