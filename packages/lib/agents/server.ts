import "server-only";

// The agent platform's data (see ./README.md). Everything here uses the admin
// client: callers (./actions.ts and the pages) check who's asking first.

import { clientUrl } from "@repo/lib/client-portal/paths";
import { findClientCandidates, resolveOrCreateClient, type ClientMatchReason } from "@repo/lib/clients/dedupe";
import { formatMoney } from "@repo/lib/currency/format";
import { clientCurrency } from "@repo/lib/currency/server";
import { AppError } from "@repo/lib/kernel/core";
import { buildAndInsertOrder, type BuildOrderResult } from "@repo/lib/orders/create";
import { orderNeedsCall } from "@repo/lib/orders/needs-call";
import type { OrderItemInput } from "@repo/lib/orders/types";
import { notifyActor } from "@repo/lib/push/send";
import { resendMailer } from "@repo/lib/studio-access/adapters/resend/mailer";
import { createAdminClient } from "@repo/lib/supabase/admin";
import type { OrderStage, OrderType, ProductionStatus } from "@repo/lib/types";
import { paidByOrders } from "@repo/lib/wallet/orders";

import {
  AGENT_STAGE_LABELS,
  agentFigures,
  agentStage,
  isFinalStage,
  payBeforeProduction,
  type AgentFigures,
  type AgentStage,
  type CommissionStatus,
  type FeePaidBy,
} from "./core";

export interface Agent {
  id: string;
  name: string;
  active: boolean;
  clientId: string | null;
  rateOverride: number | null;
  /** Their own % to pay before production; null: the setting for all agents. */
  payFirstOverride: number | null;
  email: string | null;
  phone: string | null;
}

interface AgentRow {
  id: string;
  name: string;
  active: boolean;
  client_id: string | null;
  rate_override: number | string | null;
  pay_first_override: number | null;
  client: { email: string | null; phone: string | null } | null;
}

const AGENT_COLUMNS = "id, name, active, client_id, rate_override, pay_first_override, client:clients (email, phone)";

const toAgent = (r: AgentRow): Agent => ({
  id: r.id,
  name: r.name,
  active: r.active,
  clientId: r.client_id,
  rateOverride: r.rate_override === null ? null : Number(r.rate_override),
  payFirstOverride: r.pay_first_override,
  email: r.client?.email ?? null,
  phone: r.client?.phone ?? null,
});

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** The agent this account is, if any. */
export async function agentOfClient(clientId: string): Promise<Agent | null> {
  const row = must(await createAdminClient().from("agents").select(AGENT_COLUMNS).eq("client_id", clientId).maybeSingle<AgentRow>());
  return row ? toAgent(row) : null;
}

/** Every agent, by name. */
export async function listAgents(): Promise<Agent[]> {
  return (must(await createAdminClient().from("agents").select(AGENT_COLUMNS).order("name").returns<AgentRow[]>()) ?? []).map(toAgent);
}

export async function agentById(id: string): Promise<Agent | null> {
  const row = must(await createAdminClient().from("agents").select(AGENT_COLUMNS).eq("id", id).maybeSingle<AgentRow>());
  return row ? toAgent(row) : null;
}

// --- Registering and managing (the boss) ---------------------------------------

/**
 * Registers an agent: their account is the client with that phone or email, or a
 * new one. `agentId`: an old name-only agent getting a login. They set their
 * password with "Forgot password" on the sign-in page, by a code to this email.
 */
export async function registerAgent(input: { agentId: string | null; name: string; email: string; phone: string; rateOverride: number | null }): Promise<void> {
  const db = createAdminClient();
  const resolved = await resolveOrCreateClient(db, { name: input.name, email: input.email, phone: input.phone });
  if (!resolved.ok) throw new AppError(resolved.error);
  const clientId = resolved.client.id;
  if (await agentOfClient(clientId)) throw new AppError("That phone number or email already belongs to an agent.");

  const row = { name: input.name, client_id: clientId, rate_override: input.rateOverride, active: true, updated_at: new Date().toISOString() };
  const { error } = input.agentId ? await db.from("agents").update(row).eq("id", input.agentId) : await db.from("agents").insert(row);
  if (error) throw new Error(error.message);

  const link = clientUrl("/agents");
  await resendMailer
    .send({
      to: resolved.client.email ?? input.email,
      subject: "You're now an Aming agent",
      text: `Hello ${input.name},\n\nYou've been registered as an Aming sales agent. Open ${link} to place orders, follow them and see your commission.\n\nFirst time here? On the sign-in page choose "Forgot password" and enter this email: we'll send you a code to set your password.`,
      html: `<p>Hello ${escapeHtml(input.name)},</p><p>You've been registered as an Aming sales agent. <a href="${link}">Open your agent page</a> to place orders, follow them and see your commission.</p><p>First time here? On the sign-in page choose "Forgot password" and enter this email: we'll send you a code to set your password.</p>`,
    })
    .catch((err) => console.error("agents: welcome email failed:", err));
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function editAgent(input: { agentId: string; name: string; rateOverride: number | null; payFirstOverride: number | null }): Promise<void> {
  must(
    await createAdminClient()
      .from("agents")
      .update({ name: input.name, rate_override: input.rateOverride, pay_first_override: input.payFirstOverride, updated_at: new Date().toISOString() })
      .eq("id", input.agentId),
  );
}

export async function setAgentActive(id: string, active: boolean): Promise<void> {
  must(await createAdminClient().from("agents").update({ active, updated_at: new Date().toISOString() }).eq("id", id));
}

export interface CategoryRate {
  categoryId: string;
  categoryName: string;
  /** Null: none set, so it earns nothing. */
  rate: number | null;
}

export async function categoryRates(): Promise<CategoryRate[]> {
  const db = createAdminClient();
  const [categories, rates] = await Promise.all([
    db.from("product_categories").select("id, name").eq("active", true).order("sort_order"),
    db.from("commission_rates").select("category_id, rate"),
  ]);
  const byCategory = new Map((must(rates) ?? []).map((r) => [r.category_id as string, Number(r.rate)]));
  return (must(categories) ?? []).map((c) => ({ categoryId: c.id, categoryName: c.name, rate: byCategory.get(c.id) ?? null }));
}

export async function setCategoryRate(categoryId: string, rate: number, byName: string): Promise<void> {
  must(await createAdminClient().from("commission_rates").upsert({ category_id: categoryId, rate, updated_by_name: byName, updated_at: new Date().toISOString() }));
}

export async function feePaidBy(): Promise<FeePaidBy> {
  const row = must(await createAdminClient().from("agent_settings").select("withdrawal_fee_paid_by").single<{ withdrawal_fee_paid_by: FeePaidBy }>());
  return row!.withdrawal_fee_paid_by;
}

export async function setFeePaidBy(paidBy: FeePaidBy, byName: string): Promise<void> {
  must(await createAdminClient().from("agent_settings").update({ withdrawal_fee_paid_by: paidBy, updated_by_name: byName, updated_at: new Date().toISOString() }).eq("id", true));
}

/** The % of the price an agent's own order must have paid before production, for agents without their own. */
export async function payFirstForAll(): Promise<number> {
  return must(await createAdminClient().from("agent_settings").select("pay_first_percent").single<{ pay_first_percent: number }>())!.pay_first_percent;
}

export async function setPayFirstForAll(percent: number, byName: string): Promise<void> {
  must(await createAdminClient().from("agent_settings").update({ pay_first_percent: percent, updated_by_name: byName, updated_at: new Date().toISOString() }).eq("id", true));
}

/** This agent's % to pay before production: their own, else the setting for all agents. Read when it's checked, so a change applies to orders already waiting. */
export async function payFirstPercent(agentId: string): Promise<number> {
  const [row, all] = await Promise.all([createAdminClient().from("agents").select("pay_first_override").eq("id", agentId).maybeSingle<{ pay_first_override: number | null }>(), payFirstForAll()]);
  return must(row)?.pay_first_override ?? all;
}

// --- Orders ----------------------------------------------------------------------

export interface AgentOrderLine {
  id: string;
  product: string;
  qty: number;
  unitPrice: number | null;
  production_status: ProductionStatus;
  stage: OrderStage;
}

export interface AgentOrder {
  id: string;
  orderNo: string;
  clientId: string | null;
  clientName: string;
  stage: AgentStage;
  price: number | null;
  paid: number;
  createdAt: string;
  deliveryDate: string | null;
  lines: AgentOrderLine[];
  commission: { status: CommissionStatus; amount: number; creditedAmount: number; creditedAt: string | null };
  /** Earns commission (orders.commission_eligible). Orders tagged before 2026-11-04 show, but don't. */
  earns: boolean;
  /** The invoice's share link token, once staff generated it. */
  invoiceToken: string | null;
}

interface OrderRow {
  id: string;
  order_no: string;
  client_id: string | null;
  client_name: string;
  quoted_price: number | string | null;
  commission_eligible: boolean;
  approval_status: string;
  cancelled_at: string | null;
  created_at: string;
  delivery_date: string | null;
  items: { id: string; product: string; qty: number; unit_price: number | string | null; production_status: ProductionStatus; stage: OrderStage }[];
  commission: { status: CommissionStatus; amount: number | string; credited_amount: number | string; credited_at: string | null } | null;
  invoice: { share_token: string } | { share_token: string }[] | null;
}

const ORDER_COLUMNS = `id, order_no, client_id, client_name, quoted_price, commission_eligible, approval_status, cancelled_at, created_at, delivery_date,
  items:order_items (id, product, qty, unit_price, production_status, stage),
  commission:agent_commissions (status, amount, credited_amount, credited_at),
  invoice:invoices (share_token)`;

async function toOrders(rows: OrderRow[]): Promise<AgentOrder[]> {
  const paid = await paidByOrders(rows.map((r) => r.id));
  return rows.map((r) => {
    const invoice = Array.isArray(r.invoice) ? r.invoice[0] : r.invoice;
    return {
      id: r.id,
      orderNo: r.order_no,
      clientId: r.client_id,
      clientName: r.client_name,
      stage: agentStage({ cancelled_at: r.cancelled_at, approval_status: r.approval_status, lines: r.items }),
      price: r.quoted_price === null ? null : Number(r.quoted_price),
      paid: paid[r.id] ?? 0,
      createdAt: r.created_at,
      deliveryDate: r.delivery_date,
      lines: r.items.map((i) => ({ id: i.id, product: i.product, qty: i.qty, unitPrice: i.unit_price === null ? null : Number(i.unit_price), production_status: i.production_status, stage: i.stage })),
      commission: {
        status: r.commission?.status ?? "pending",
        amount: Number(r.commission?.amount ?? 0),
        creditedAmount: Number(r.commission?.credited_amount ?? 0),
        creditedAt: r.commission?.credited_at ?? null,
      },
      earns: r.commission_eligible,
      invoiceToken: invoice?.share_token ?? null,
    };
  });
}

/** An agent's orders, newest first, including older tagged ones that don't earn; `clientId`: those for one client. */
export async function agentOrders(agentId: string, clientId?: string): Promise<AgentOrder[]> {
  let query = createAdminClient().from("orders").select(ORDER_COLUMNS).eq("agent_id", agentId);
  if (clientId) query = query.eq("client_id", clientId);
  return toOrders(must(await query.order("created_at", { ascending: false }).returns<OrderRow[]>()) ?? []);
}

/** One of this agent's orders, or null: an agent never opens another's. */
export async function agentOrder(agentId: string, orderId: string): Promise<AgentOrder | null> {
  const row = must(await createAdminClient().from("orders").select(ORDER_COLUMNS).eq("id", orderId).eq("agent_id", agentId).maybeSingle<OrderRow>());
  return row ? (await toOrders([row]))[0] : null;
}

/** For staff: among these orders, the agents' own ones that must be part paid before production, with what's paid, the % and the amount needed (null until priced). */
export async function agentPaymentsFor(orderIds: string[]): Promise<Record<string, { paid: number; percent: number; needed: number | null }>> {
  if (!orderIds.length) return {};
  const rows = must(await createAdminClient().from("orders").select("id, quoted_price, agent_id").in("id", orderIds).eq("placed_by_agent", true).returns<{ id: string; quoted_price: number | string | null; agent_id: string }[]>()) ?? [];
  const percents = new Map(await Promise.all([...new Set(rows.map((r) => r.agent_id))].map(async (a) => [a, await payFirstPercent(a)] as const)));
  const waiting = rows.filter((r) => percents.get(r.agent_id)! > 0);
  const paid = await paidByOrders(waiting.map((r) => r.id));
  return Object.fromEntries(
    waiting.map((r) => {
      const percent = percents.get(r.agent_id)!;
      return [r.id, { paid: paid[r.id] ?? 0, percent, needed: r.quoted_price === null ? null : payBeforeProduction(Number(r.quoted_price), percent) }];
    }),
  );
}

/** A commission the triggers couldn't work out is tried again whenever the agent looks. */
export async function settlePending(agentId: string): Promise<void> {
  const db = createAdminClient();
  const pending = must(await db.from("agent_commissions").select("order_id").eq("agent_id", agentId).eq("status", "pending")) ?? [];
  for (const { order_id } of pending) {
    const { error } = await db.rpc("agent_commission_evaluate", { p_order: order_id });
    if (error) console.error("agents: commission not worked out:", order_id, error.message);
  }
}

export async function figuresFor(agentId: string): Promise<AgentFigures & { orders: AgentOrder[] }> {
  const db = createAdminClient();
  const [orders, wallet, withdrawn] = await Promise.all([
    agentOrders(agentId),
    db.from("agent_wallets").select("balance").eq("agent_id", agentId).maybeSingle<{ balance: number | string }>(),
    db.from("agent_withdrawals").select("amount").eq("agent_id", agentId).eq("status", "paid"),
  ]);
  // Figures count the orders that earn; older tagged ones are only listed.
  const earning = orders.filter((o) => o.earns);
  const figures = agentFigures({
    stages: earning.map((o) => o.stage),
    commissions: earning.map((o) => ({ status: o.commission.status, amount: o.commission.amount, credited_amount: o.commission.creditedAmount })),
    balance: Number(must(wallet)?.balance ?? 0),
    withdrawn: (must(withdrawn) ?? []).reduce((sum, w) => sum + Number(w.amount), 0),
  });
  return { ...figures, orders };
}

export interface AgentListRow extends Agent {
  figures: AgentFigures;
  /** What their delivered orders sold for. */
  salesValue: number;
}

/** Every agent with their figures, for the admin's list. */
export async function listAgentsWithFigures(): Promise<AgentListRow[]> {
  const rows = must(await createAdminClient().from("agents").select(AGENT_COLUMNS).order("name").returns<AgentRow[]>()) ?? [];
  return Promise.all(
    rows.map(async (r) => {
      const { orders, ...figures } = await figuresFor(r.id);
      return { ...toAgent(r), figures, salesValue: orders.filter((o) => o.earns && o.stage === "delivered").reduce((sum, o) => sum + (o.price ?? 0), 0) };
    }),
  );
}

/** What all agents' balances come to: money Aming owes them. */
export async function totalOwedToAgents(): Promise<number> {
  const rows = must(await createAdminClient().from("agent_wallets").select("balance")) ?? [];
  return rows.reduce((sum, w) => sum + Math.max(Number(w.balance), 0), 0);
}

export interface PlacedAgentOrder {
  clientId: string;
  order_type: OrderType;
  delivery_date: string;
  order_notes: string;
  items: OrderItemInput[];
}

/** An agent's order: into reception's normal queue, at catalog prices, earning commission. */
export async function placeForClient(agent: Agent, input: PlacedAgentOrder): Promise<Extract<BuildOrderResult, { ok: true }>> {
  if (!agent.active) throw new AppError("Your agent account is inactive. Contact Aming.");
  if (!input.delivery_date) throw new AppError("Delivery date is required.");
  if (!(await ownsClient(agent.id, input.clientId))) throw new AppError("That client isn't one of yours.");

  const db = createAdminClient();
  const client = must(await db.from("clients").select("id, name, email, phone").eq("id", input.clientId).single<{ id: string; name: string; email: string | null; phone: string | null }>())!;
  const res = await buildAndInsertOrder(db, {
    // The currency the agent is looking at (their top bar); the invoice is issued in it.
    currency: (await clientCurrency()).code,
    client,
    agentId: agent.id,
    agentName: agent.name,
    designer: null,
    route: "factory",
    orderType: input.order_type,
    deliveryDate: input.delivery_date,
    deadlineAt: "",
    orderNotes: input.order_notes,
    designerBrief: "",
    responsibleWorkerId: null,
    items: input.items,
    releaseImmediately: false,
    // Their own order: production once their % is paid (payFirstPercent).
    placedByAgent: true,
  });
  if (!res.ok) throw new AppError(res.error);

  const needsCall = await orderNeedsCall(db, res.orderId);
  await tellManagers({
    title: needsCall ? "Photo book order from an agent — call the client" : "New order from an agent",
    body: `Order ${res.orderNo} from ${agent.name}, for ${client.name}${client.phone ? ` (${client.phone})` : ""}`,
    url: "/dashboard/order-approvals",
  });
  return res;
}

async function tellManagers(notice: { title: string; body: string; url: string }): Promise<void> {
  const managers = must(await createAdminClient().from("profiles").select("id").in("role", ["receptionist", "supervisor", "boss"])) ?? [];
  await Promise.all(managers.map((m) => notifyActor({ type: "dashboard_user", id: m.id }, notice))).catch((err) => console.error("agents: push failed:", err));
}

// --- Whose client is whose ---------------------------------------------------------

export interface AgentClient {
  /** agent_clients' id. */
  id: string;
  clientId: string;
  status: "active" | "pending" | "refused";
  name: string;
  phone: string | null;
  email: string | null;
  /** The client has a login: their details are theirs to change, not the agent's. */
  locked: boolean;
}

interface AgentClientRow {
  id: string;
  client_id: string;
  status: AgentClient["status"];
  entered_name: string;
  entered_phone: string | null;
  entered_email: string | null;
  client: { name: string; phone: string | null; email: string | null } | null;
}

const AGENT_CLIENT_COLUMNS = "id, client_id, status, entered_name, entered_phone, entered_email, client:clients (name, phone, email)";

/** Until a client is theirs, the agent sees only what they typed, never the client's own details. */
function toAgentClient(r: AgentClientRow, withLogin: Set<string>): AgentClient {
  const own = r.status === "active" && r.client;
  return {
    id: r.id,
    clientId: r.client_id,
    status: r.status,
    name: own ? r.client!.name : r.entered_name,
    phone: own ? r.client!.phone : r.entered_phone,
    email: own ? r.client!.email : r.entered_email,
    locked: withLogin.has(r.client_id),
  };
}

async function clientsWithLogin(clientIds: string[]): Promise<Set<string>> {
  if (!clientIds.length) return new Set();
  const rows = must(await createAdminClient().from("client_identities").select("client_id").in("client_id", clientIds)) ?? [];
  return new Set(rows.map((r) => r.client_id as string));
}

export async function agentClients(agentId: string): Promise<AgentClient[]> {
  const rows = must(await createAdminClient().from("agent_clients").select(AGENT_CLIENT_COLUMNS).eq("agent_id", agentId).order("created_at", { ascending: false }).returns<AgentClientRow[]>()) ?? [];
  const withLogin = await clientsWithLogin(rows.map((r) => r.client_id));
  return rows.map((r) => toAgentClient(r, withLogin));
}

export async function agentClient(agentId: string, clientId: string): Promise<AgentClient | null> {
  const row = must(await createAdminClient().from("agent_clients").select(AGENT_CLIENT_COLUMNS).eq("agent_id", agentId).eq("client_id", clientId).maybeSingle<AgentClientRow>());
  return row ? toAgentClient(row, await clientsWithLogin([clientId])) : null;
}

async function ownsClient(agentId: string, clientId: string): Promise<boolean> {
  const row = must(await createAdminClient().from("agent_clients").select("id").eq("agent_id", agentId).eq("client_id", clientId).eq("status", "active").maybeSingle());
  return !!row;
}

/**
 * Registers a client. New to Aming: theirs at once. Already on Aming (the phone or
 * email matches): waits for staff, and the agent learns nothing about who it is.
 */
export async function addClient(agent: Agent, input: { name: string; phone: string; email: string }): Promise<{ pending: boolean }> {
  if (!agent.active) throw new AppError("Your agent account is inactive. Contact Aming.");
  const db = createAdminClient();
  const resolved = await resolveOrCreateClient(db, { name: input.name, phone: input.phone, email: input.email || null });
  if (!resolved.ok) throw new AppError(resolved.error);
  const clientId = resolved.client.id;
  if (clientId === agent.clientId) throw new AppError("You can't be your own client.");

  const entered = { entered_name: input.name, entered_phone: input.phone, entered_email: input.email || null };
  if (!resolved.client.reused) {
    must(await db.from("agent_clients").insert({ agent_id: agent.id, client_id: clientId, status: "active", ...entered }));
    return { pending: false };
  }

  const existing = must(await db.from("agent_clients").select("id, status").eq("agent_id", agent.id).eq("client_id", clientId).maybeSingle<{ id: string; status: AgentClient["status"] }>());
  if (existing?.status === "active") throw new AppError("That client is already on your list.");
  if (existing?.status === "pending") throw new AppError("That client is already waiting for Aming to check.");
  if (existing) {
    must(await db.from("agent_clients").update({ status: "pending", ...entered, decided_by_name: null, decided_at: null }).eq("id", existing.id));
  } else {
    must(await db.from("agent_clients").insert({ agent_id: agent.id, client_id: clientId, status: "pending", ...entered }));
  }
  await tellManagers({ title: "Agent's client to check", body: `${agent.name} registered someone already on Aming.`, url: "/dashboard/agents/clients" });
  return { pending: true };
}

/** An agent edits a client's details, only one of theirs that has no login of its own. */
export async function editClient(agent: Agent, clientId: string, input: { name: string; phone: string; email: string }): Promise<void> {
  const client = await agentClient(agent.id, clientId);
  if (client?.status !== "active") throw new AppError("That client isn't one of yours.");
  if (client.locked) throw new AppError("This client has their own login, so only they or Aming can change their details.");
  const { error } = await createAdminClient().from("clients").update({ name: input.name, phone: input.phone, email: input.email || null }).eq("id", clientId);
  if (error?.code === "23505") throw new AppError("Another client already has that phone number or email.");
  if (error) throw new Error(error.message);
}

export interface ClientMatch {
  id: string;
  agentName: string;
  enteredName: string;
  enteredPhone: string | null;
  enteredEmail: string | null;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  /** The agent the client already belongs to, if any. */
  currentAgent: string | null;
  createdAt: string;
}

/** Registrations that matched someone already on Aming, for staff to decide. */
export async function pendingClientMatches(): Promise<ClientMatch[]> {
  const db = createAdminClient();
  const rows =
    must(
      await db
        .from("agent_clients")
        .select("id, client_id, entered_name, entered_phone, entered_email, created_at, agent:agents (name), client:clients (name, phone, email)")
        .eq("status", "pending")
        .order("created_at")
        .returns<{ id: string; client_id: string; entered_name: string; entered_phone: string | null; entered_email: string | null; created_at: string; agent: { name: string } | null; client: { name: string; phone: string | null; email: string | null } | null }[]>(),
    ) ?? [];
  const current = rows.length ? must(await db.from("agent_clients").select("client_id, agent:agents (name)").eq("status", "active").in("client_id", rows.map((r) => r.client_id)).returns<{ client_id: string; agent: { name: string } | null }[]>()) ?? [] : [];
  const currentByClient = new Map(current.map((c) => [c.client_id, c.agent?.name ?? null]));
  return rows.map((r) => ({
    id: r.id,
    agentName: r.agent?.name ?? "An agent",
    enteredName: r.entered_name,
    enteredPhone: r.entered_phone,
    enteredEmail: r.entered_email,
    clientName: r.client?.name ?? "",
    clientPhone: r.client?.phone ?? null,
    clientEmail: r.client?.email ?? null,
    currentAgent: currentByClient.get(r.client_id) ?? null,
    createdAt: r.created_at,
  }));
}

/** Staff answer a match; the agent is told, in their own words only. */
export async function decideClientMatch(id: string, approve: boolean, byName: string): Promise<void> {
  const db = createAdminClient();
  const { data: row, error } = await db
    .from("agent_clients")
    .update({ status: approve ? "active" : "refused", decided_by_name: byName, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("entered_name, agent:agents (client_id)")
    .maybeSingle<{ entered_name: string; agent: { client_id: string | null } | null }>();
  if (error?.code === "23505") throw new AppError("That client already belongs to another agent.");
  if (error) throw new Error(error.message);
  if (!row) throw new AppError("This was already answered.");
  if (row.agent?.client_id) {
    await notifyActor(
      { type: "client", id: row.agent.client_id },
      approve
        ? { title: "Client added", body: `${row.entered_name} is on your client list. You can place orders for them.`, url: "/agents/clients" }
        : { title: "Client not added", body: `Aming didn't add ${row.entered_name} to your client list.`, url: "/agents/clients" },
    ).catch((err) => console.error("agents: push failed:", err));
  }
}

// --- Agents' clients, for the boss ----------------------------------------------------

export interface AgentClientListRow {
  clientId: string;
  agentId: string;
  agentName: string;
  /** The client's details on Aming. */
  name: string;
  phone: string | null;
  email: string | null;
  orders: number;
}

/** Everyone on an agent's list, as they are on Aming, for the boss to tidy up. */
export async function allAgentClients(): Promise<AgentClientListRow[]> {
  const db = createAdminClient();
  const rows =
    must(
      await db
        .from("agent_clients")
        .select("client_id, agent_id, agent:agents (name), client:clients (name, phone, email)")
        .eq("status", "active")
        .returns<{ client_id: string; agent_id: string; agent: { name: string } | null; client: { name: string; phone: string | null; email: string | null } | null }[]>(),
    ) ?? [];
  const orders = rows.length ? (must(await db.from("orders").select("client_id").in("client_id", rows.map((r) => r.client_id))) ?? []) : [];
  const count = new Map<string, number>();
  for (const o of orders) count.set(o.client_id as string, (count.get(o.client_id as string) ?? 0) + 1);
  return rows
    .map((r) => ({
      clientId: r.client_id,
      agentId: r.agent_id,
      agentName: r.agent?.name ?? "An agent",
      name: r.client?.name ?? "",
      phone: r.client?.phone ?? null,
      email: r.client?.email ?? null,
      orders: count.get(r.client_id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface MergeTarget {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  matchReason: ClientMatchReason;
  /** The agent they belong to already, if any. */
  agentName: string | null;
}

/** Clients on Aming an agent's client could be, by name, phone or email. */
export async function mergeTargets(fromClientId: string, query: string): Promise<MergeTarget[]> {
  const q = query.trim();
  if (!q) return [];
  const db = createAdminClient();
  const email = q.includes("@");
  const phone = !email && /^[+\d][\d\s()-]{5,}$/.test(q);
  const found = await findClientCandidates(db, { name: email || phone ? null : q, email: email ? q : null, phone: phone ? q : null, excludeId: fromClientId, limit: 8 });
  const owners = found.length
    ? (must(await db.from("agent_clients").select("client_id, agent:agents (name)").eq("status", "active").in("client_id", found.map((c) => c.id)).returns<{ client_id: string; agent: { name: string } | null }[]>()) ?? [])
    : [];
  const ownerOf = new Map(owners.map((o) => [o.client_id, o.agent?.name ?? null]));
  return found.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, matchReason: c.match_reason, agentName: ownerOf.get(c.id) ?? null }));
}

/**
 * Merges an agent's client into the same person already on Aming
 * (merge_client, supabase/migrations/20261230100000_agent_pay_first_and_client_merge.sql):
 * their orders, payments and chats move across, the contacts the agent typed fill
 * the blanks, they stay on the agent's list, and the duplicate is removed.
 */
export async function mergeAgentClient(fromClientId: string, intoClientId: string, byName: string): Promise<void> {
  const db = createAdminClient();
  const listed = must(await db.from("agent_clients").select("id").eq("client_id", fromClientId).eq("status", "active").maybeSingle());
  if (!listed) throw new AppError("That client isn't on an agent's list any more. Refresh the page.");
  const { error } = await db.rpc("merge_client", { p_from: fromClientId, p_into: intoClientId, p_by: byName });
  // merge_client's refusals are written for the boss.
  if (error?.code === "P0001") throw new AppError(error.message);
  if (error) throw new Error(error.message);
}

/** Puts a client on another agent's list. Orders already placed stay with the agent who placed them. */
export async function moveAgentClient(clientId: string, toAgentId: string, byName: string): Promise<void> {
  const db = createAdminClient();
  // A refused or waiting registration by the new agent makes way.
  must(await db.from("agent_clients").delete().eq("agent_id", toAgentId).eq("client_id", clientId).neq("status", "active"));
  const moved = must(
    await db.from("agent_clients").update({ agent_id: toAgentId, decided_by_name: byName, decided_at: new Date().toISOString() }).eq("client_id", clientId).eq("status", "active").select("id"),
  );
  if (!moved?.length) throw new AppError("That client isn't on an agent's list any more. Refresh the page.");
}

// --- Telling agents what changed ------------------------------------------------

/**
 * Tells agents about orders that moved on and commission that changed. Run every
 * couple of minutes (apps/client/instrumentation-node.ts) rather than from each
 * place an order can change: those are many, and a 5-line order moving together
 * sends one message this way, not five.
 */
export async function tellAgents(): Promise<void> {
  const db = createAdminClient();

  const open =
    must(
      await db
        .from("orders")
        .select("id, order_no, approval_status, cancelled_at, agent_stage_told, placed_by_agent, agent_id, items:order_items (production_status, stage), agent:agents (client_id)")
        .eq("commission_eligible", true)
        .or("agent_stage_told.is.null,agent_stage_told.not.in.(delivered,cancelled)")
        .returns<{ id: string; order_no: string; approval_status: string; cancelled_at: string | null; agent_stage_told: string | null; placed_by_agent: boolean; agent_id: string; items: { production_status: ProductionStatus; stage: OrderStage }[]; agent: { client_id: string | null } | null }[]>(),
    ) ?? [];
  for (const o of open) {
    const stage = agentStage({ cancelled_at: o.cancelled_at, approval_status: o.approval_status, lines: o.items });
    if (stage === o.agent_stage_told || (isFinalStage(o.agent_stage_told) && stage !== "cancelled")) continue;
    // Claimed first, so a second run or server can't send it again.
    const claim = db.from("orders").update({ agent_stage_told: stage }).eq("id", o.id);
    const { data: claimed } = await (o.agent_stage_told === null ? claim.is("agent_stage_told", null) : claim.eq("agent_stage_told", o.agent_stage_told)).select("id");
    if (!claimed?.length || !o.agent?.client_id) continue;
    // They just placed it: no need to say so.
    if (stage === "submitted") continue;
    const percent = stage === "confirmed" && o.placed_by_agent ? await payFirstPercent(o.agent_id) : 0;
    const confirmed = percent > 0 ? `Your order is confirmed. Production starts once your client has paid ${percent}% of the price.` : "Your order is confirmed.";
    await notifyActor(
      { type: "client", id: o.agent.client_id },
      { title: `Order ${o.order_no}: ${AGENT_STAGE_LABELS[stage]}`, body: stage === "cancelled" ? "This order was cancelled." : stage === "confirmed" ? confirmed : `Your order is now ${AGENT_STAGE_LABELS[stage].toLowerCase()}.`, url: `/agents/orders/${o.id}` },
    ).catch((err) => console.error("agents: push failed:", err));
  }

  const { data: untold, error } = await db.rpc("agent_commissions_untold");
  if (error) throw new Error(error.message);
  for (const c of (untold ?? []) as { order_id: string; credited_amount: number | string; told_amount: number | string; order_no: string; client_id: string | null }[]) {
    const credited = Number(c.credited_amount);
    const told = Number(c.told_amount);
    const { data: claimed } = await db.from("agent_commissions").update({ told_amount: credited }).eq("order_id", c.order_id).eq("told_amount", told).select("order_id");
    if (!claimed?.length || !c.client_id) continue;
    const change = credited - told;
    await notifyActor(
      { type: "client", id: c.client_id },
      change > 0
        ? { title: "Commission credited", body: `${formatMoney(change)} from order ${c.order_no} is on your balance.`, url: "/agents/commission" }
        : { title: "Commission taken back", body: `${formatMoney(-change)} from order ${c.order_no} came off your balance after a refund or cancellation.`, url: "/agents/commission" },
    ).catch((err) => console.error("agents: push failed:", err));
  }
}
