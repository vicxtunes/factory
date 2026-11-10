import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { accounting } from "@repo/lib/accounting/index.server";
import { canViewAccounts } from "@repo/lib/accounting/policy";
import { registerAgent, setCommissionRate } from "@repo/lib/agents/actions";
import { agentRegisterSchema } from "@repo/lib/agents/core";
import { categoryRates, listAgentsWithFigures } from "@repo/lib/agents/server";
import type { Person } from "@repo/lib/assistant/panel/server";
import { serverHealth } from "@repo/lib/assistant/panel/tools/health";
import { accountsTools, databaseTools } from "@repo/lib/assistant/panel/tools/business";
import { addFilesToOrderTool } from "@repo/lib/assistant/panel/tools/order-files";
import { staffAdminTools } from "@repo/lib/assistant/panel/tools/staff-admin";
import { changeTool, outcome, readTool, type ChangeTool, type Toolbox } from "@repo/lib/assistant/panel/toolbox";
import type { AssistantTool } from "@repo/lib/assistant/server/tools";
import { addExpenseSchedule, recordExpense } from "@repo/lib/books/actions";
import { fetchApprovalQueueItems, fetchBoardItems, fetchDesignerItems } from "@repo/lib/queries";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { createClient } from "@repo/lib/supabase/server";
import { SUPPORT_OWNER_EMAIL } from "@repo/lib/support/constants";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import { isManagerRole, STATUS_LABELS, type AppRole, type ProductionStatus } from "@repo/lib/types";

import { addClient, overrideStatus, updateCurrency, updateUserRole } from "./dashboard/actions";

// Alexis's tools in the staff app (packages/lib/assistant/panel). Each set is
// given only to the roles the app already lets do that thing (the same
// policies its menu and pages use), and each change runs the app's own server
// action, which checks the role again when the person taps Confirm.

const PERIODS = ["today", "yesterday", "this_week", "this_month", "last_month", "this_year", "all"] as const;
const STATUSES = Object.keys(STATUS_LABELS) as [ProductionStatus, ...ProductionStatus[]];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date as YYYY-MM-DD.");

/** Words safe inside a PostgREST or() filter. */
const searchable = (s: string) => s.replace(/[,()*%\\]/g, " ").trim().slice(0, 60);

const ORDER_COLUMNS =
  "id, order_no, client_name, client_phone, delivery_date, status, approval_status, order_type, agent_name, cancelled_at, created_at, items:order_items (id, product, product_type, qty, production_status, unit_price)";

/** `inApp`: false on WhatsApp, where tools that read through the sign-in would see nothing. */
function staffReads(role: AppRole, db: SupabaseClient, inApp: boolean): AssistantTool[] {
  const tools: AssistantTool[] = [];
  if (isManagerRole(role)) {
    tools.push(
      readTool({
        name: "find_orders",
        description:
          "Find orders by order number, client name or phone, newest first; with no search, the latest orders. Each item has its id (for changing its status), product, quantity, production status and unit price in UGX.",
        inputSchema: z.object({ search: z.string().max(60).nullable(), limit: z.number().int().min(1).max(20).nullable() }),
        run: async ({ search, limit }) => {
          let query = db.from("orders").select(ORDER_COLUMNS).order("created_at", { ascending: false }).limit(limit ?? 10);
          const q = search ? searchable(search) : "";
          if (q) query = query.or(`order_no.ilike.%${q}%,client_name.ilike.%${q}%,client_phone.ilike.%${q}%`);
          const { data, error } = await query;
          if (error) throw new Error(error.message);
          return data;
        },
      }),
      readTool({
        name: "find_clients",
        description: "Find Aming's clients by name, phone or email.",
        inputSchema: z.object({ search: z.string().min(1).max(60) }),
        run: async ({ search }) => {
          const q = searchable(search);
          const { data, error } = await db
            .from("clients")
            .select("id, name, phone, email, active, created_at")
            .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
            .order("name")
            .limit(15);
          if (error) throw new Error(error.message);
          return data;
        },
      }),
    );
    if (inApp) tools.push(
      readTool({
        name: "orders_waiting_for_review",
        description: "Client orders waiting for reception to quote, approve and route.",
        inputSchema: z.object({}),
        run: async () => {
          const items = await fetchApprovalQueueItems();
          const orders = new Map(items.map((i) => [i.order_id, { orderNo: i.order.order_no, client: i.order.client_name, approval: i.order.approval_status }]));
          return { count: orders.size, orders: [...orders.values()].slice(0, 20) };
        },
      }),
    );
  }
  if (canViewAccounts(role)) {
    tools.push(
      readTool({
        name: "money_overview",
        description: "Aming's money for a period at a glance, in UGX: money received and sales (with the period before), what clients owe and what's overdue, and money received by channel. For each payment behind a figure, use payments.",
        inputSchema: z.object({ period: z.enum(PERIODS) }),
        run: async ({ period }) => {
          const view = await accounting.dashboard(await resolveTenantScope(), { preset: period });
          return { period: view.period, received: view.received, sales: view.sales, owed: view.owed, byChannel: view.byChannel };
        },
      }),
      ...accountsTools(),
      readTool({
        name: "expense_categories",
        description: "The expense categories (key and name), for recording an expense.",
        inputSchema: z.object({}),
        run: async () => {
          const scope = await resolveTenantScope();
          const { data, error } = await createAdminClient().from("expense_categories").select("key, name, automatic").eq("tenant_id", scope.tenantId).eq("automatic", false);
          if (error) throw new Error(error.message);
          return data;
        },
      }),
    );
  }
  if (role === "boss") {
    tools.push(
      ...databaseTools(),
      readTool({
        name: "server_health",
        description: "Whether the sites are up (Uptime Kuma), how busy the server is (Beszel), and the money watch's open alerts.",
        inputSchema: z.object({}),
        run: serverHealth,
      }),
      readTool({
        name: "agents",
        description: "Every agent with their orders, sales, commission and balance in UGX, and the commission rate per product category.",
        inputSchema: z.object({}),
        run: async () => ({ agents: (await listAgentsWithFigures()).slice(0, 50), ratesByCategory: await categoryRates() }),
      }),
      readTool({
        name: "staff_accounts",
        description: "Everyone who signs in to the dashboard, with their role.",
        inputSchema: z.object({}),
        run: async () => {
          const { data, error } = await createAdminClient().from("profiles").select("id, full_name, role").order("full_name");
          if (error) throw new Error(error.message);
          return data;
        },
      }),
      readTool({
        name: "currencies",
        description: "The currencies clients can see prices in, with how many UGX one unit is worth and whether each is on.",
        inputSchema: z.object({}),
        run: async () => {
          const { data, error } = await createAdminClient().from("currencies").select("code, label, rate, active, is_base").order("sort_order");
          if (error) throw new Error(error.message);
          return (data ?? []).map((c) => ({ code: c.code, label: c.label, on: c.active, base: c.is_base, ugxPerUnit: Number(c.rate) > 0 ? Math.round((1 / Number(c.rate)) * 100) / 100 : null }));
        },
      }),
    );
  }
  return tools;
}

async function itemFor(itemId: string) {
  const { data } = await createAdminClient()
    .from("order_items")
    .select("product, product_type, production_status, order:orders!inner (order_no, client_name)")
    .eq("id", itemId)
    .maybeSingle<{ product: string; product_type: string | null; production_status: ProductionStatus; order: { order_no: string; client_name: string | null } }>();
  if (!data) throw new Error("That item doesn't exist. Look the order up again.");
  return data;
}

function staffChanges(role: AppRole): ChangeTool[] {
  const tools: ChangeTool[] = [];
  if (isManagerRole(role)) {
    tools.push(
      changeTool({
        name: "set_item_status",
        description: "Change an order item's production status. Use the item id from find_orders.",
        inputSchema: z.object({ itemId: z.string().uuid(), status: z.enum(STATUSES) }),
        card: async ({ itemId, status }) => {
          const item = await itemFor(itemId);
          return {
            title: `Order ${item.order.order_no}: mark ${item.product} as ${STATUS_LABELS[status]}`,
            lines: [`Client: ${item.order.client_name ?? "unknown"}`, `Now: ${STATUS_LABELS[item.production_status]}`, `After: ${STATUS_LABELS[status]}`],
          };
        },
        run: async ({ itemId, status }) => outcome(await overrideStatus(itemId, status), `The item is now ${STATUS_LABELS[status]}.`),
      }),
      changeTool({
        name: "add_client",
        description: "Add a new client to Aming. Phone is required; email can be empty.",
        inputSchema: z.object({ name: z.string().trim().min(1).max(100), phone: z.string().trim().min(1).max(30), email: z.string().trim().max(120) }),
        card: async (c) => ({ title: `Add client ${c.name}`, lines: [`Phone: ${c.phone}`, c.email ? `Email: ${c.email}` : "No email"] }),
        run: async (c) => outcome(await addClient(c), `${c.name} is now a client.`),
      }),
      addFilesToOrderTool(null),
    );
  }
  if (canViewAccounts(role)) {
    const expense = z.object({
      name: z.string().trim().min(1).max(120),
      category: z.string().min(1).describe("A category key from expense_categories."),
      amount: z.number().int().positive().describe("UGX"),
      recipient: z.string().max(120).nullable(),
      description: z.string().max(500).nullable(),
    });
    tools.push(
      changeTool({
        name: "record_expense",
        description: "Record an expense (money spent or owed). Amount in whole UGX.",
        inputSchema: expense.extend({ spentOn: day, dueOn: day.nullable().describe("When it must be paid, if it's owed.") }),
        card: async (e) => ({
          title: `Record expense: ${e.name}, UGX ${e.amount.toLocaleString("en-UG")}`,
          lines: [`Category: ${e.category}`, `Date: ${e.spentOn}`, ...(e.dueOn ? [`Due: ${e.dueOn}`] : []), ...(e.recipient ? [`Paid to: ${e.recipient}`] : [])],
        }),
        run: async (e) => outcome(await recordExpense({ ...e, id: randomUUID(), recipient: e.recipient ?? "", description: e.description ?? "" }), `${e.name} is recorded under Expenses.`),
      }),
      changeTool({
        name: "add_expense_reminder",
        description: "Add a repeating expense (rent, salaries, internet…) that comes due every week, month or year, with a reminder.",
        inputSchema: expense.extend({ every: z.enum(["week", "month", "year"]), firstDueOn: day, varies: z.boolean().describe("The amount changes each time.") }),
        card: async (e) => ({
          title: `Repeating expense: ${e.name}, UGX ${e.amount.toLocaleString("en-UG")} every ${e.every}`,
          lines: [`Category: ${e.category}`, `First due: ${e.firstDueOn}`, e.varies ? "The amount varies" : "Same amount each time", ...(e.recipient ? [`Paid to: ${e.recipient}`] : [])],
        }),
        run: async (e) => outcome(await addExpenseSchedule({ ...e, id: randomUUID(), recipient: e.recipient ?? "", description: e.description ?? "" }), `${e.name} will come due every ${e.every}.`),
      }),
    );
  }
  if (role === "boss") {
    tools.push(
      changeTool({
        name: "set_currency_rate",
        description: "Set how many UGX one unit of a currency is worth (e.g. 1 KES = 28 UGX).",
        inputSchema: z.object({ code: z.string().length(3), ugxPerUnit: z.number().positive() }),
        card: async ({ code, ugxPerUnit }) => {
          const { data } = await createAdminClient().from("currencies").select("label, rate, is_base").eq("code", code.toUpperCase()).maybeSingle();
          if (!data) throw new Error(`There's no ${code} currency. Add it in Products → Currencies first.`);
          if (data.is_base) throw new Error("UGX is the base currency: its rate is always 1.");
          const now = Number(data.rate) > 0 ? `${Math.round((1 / Number(data.rate)) * 100) / 100}` : "not set";
          return { title: `Set 1 ${code.toUpperCase()} = ${ugxPerUnit.toLocaleString("en-UG")} UGX`, lines: [`${data.label}`, `Now: 1 ${code.toUpperCase()} = ${now} UGX`] };
        },
        run: async ({ code, ugxPerUnit }) => {
          const { data } = await createAdminClient().from("currencies").select("id, label, symbol").eq("code", code.toUpperCase()).maybeSingle();
          if (!data) return { ok: false, error: "That currency is gone." };
          return outcome(await updateCurrency(data.id, { label: data.label, symbol: data.symbol, rate: String(1 / ugxPerUnit) }), `1 ${code.toUpperCase()} is now ${ugxPerUnit} UGX.`);
        },
      }),
      changeTool({
        name: "set_staff_role",
        description: "Change a dashboard user's role. Use the id from staff_accounts.",
        inputSchema: z.object({ userId: z.string().uuid(), role: z.enum(["receptionist", "supervisor", "boss"]) }),
        card: async ({ userId, role: next }) => {
          const { data } = await createAdminClient().from("profiles").select("full_name, role").eq("id", userId).maybeSingle();
          if (!data) throw new Error("That person doesn't exist.");
          return { title: `Make ${data.full_name ?? "this person"} a ${next}`, lines: [`Now: ${data.role}`, `After: ${next}`] };
        },
        run: async ({ userId, role: next }) => outcome(await updateUserRole({ id: userId, role: next }), `Their role is now ${next}.`),
      }),
      changeTool({
        name: "set_commission_rate",
        description: "Set agents' commission rate (percent) for a product category. Use the category id from agents.",
        inputSchema: z.object({ categoryId: z.string().uuid(), rate: z.number().min(0).max(100) }),
        card: async ({ categoryId, rate }) => {
          const found = (await categoryRates()).find((c) => c.categoryId === categoryId);
          if (!found) throw new Error("That category doesn't exist.");
          return { title: `Agents earn ${rate}% on ${found.categoryName}`, lines: [`Now: ${found.rate == null ? "not set" : `${found.rate}%`}`] };
        },
        run: async (input) => outcome(await setCommissionRate(input), `Agents now earn ${input.rate}% on that category.`),
      }),
      changeTool({
        name: "register_agent",
        description: "Register a new agent with a login (they sign in with an emailed code). rateOverride: their own commission percent, or null for the category rates.",
        inputSchema: agentRegisterSchema.omit({ agentId: true }),
        card: async (a) => ({
          title: `Register agent ${a.name}`,
          lines: [`Email: ${a.email}`, `Phone: ${a.phone}`, a.rateOverride == null ? "Commission: the category rates" : `Commission: ${a.rateOverride}% on everything`],
        }),
        run: async (a) => outcome(await registerAgent({ ...a, agentId: null }), `${a.name} is registered as an agent.`),
      }),
    );
  }
  return tools;
}

function abilities(role: AppRole, change: ChangeTool[], read: AssistantTool[]): string {
  const parts = ["Look things up for their role:"];
  if (isManagerRole(role)) parts.push("orders, clients and orders waiting for review;");
  if (read.some((t) => t.name === "announcements")) parts.push("announcements;");
  if (read.some((t) => t.name === "support_tickets")) parts.push("support tickets;");
  if (canViewAccounts(role)) parts.push("money at a glance, every payment, sale and expense for any period;");
  if (role === "boss") parts.push("server health, agents, staff accounts, currencies, and everything else in the business through the database (every feature: orders, production, Drive files, chats, wallets, agents, vendors, studios, notifications…);");
  if (change.length) parts.push(`Prepare these changes for them to confirm: ${change.map((c) => c.name.replace(/_/g, " ")).join(", ")}.`);
  else parts.push("They can't make changes through you.");
  parts.push("No payments, refunds, withdrawals or payouts yet; deleting only where a change above says so.");
  return parts.join(" ");
}

/** The toolbox for whoever is signed in to the staff app. `channel`: WhatsApp has no app sign-in, so it reads with the app's rights and changes nothing. */
export async function staffAppToolbox(person: Person, _page: string, channel: "app" | "whatsapp" = "app"): Promise<Toolbox> {
  if (person.type === "designer") {
    return {
      read: [
        readTool({
          name: "my_design_orders",
          description: "The orders assigned to this designer, with their items and statuses.",
          inputSchema: z.object({}),
          run: async () =>
            (await fetchDesignerItems(person.id)).slice(0, 40).map((i) => ({ orderNo: i.order.order_no, client: i.order.client_name, product: i.product, stage: i.stage, status: i.production_status, deliveryDate: i.order.delivery_date })),
        }),
      ],
      change: [],
      abilities: "Look up the orders assigned to them. They can't make changes through you.",
    };
  }
  if (person.type === "worker") {
    return {
      read: [
        readTool({
          name: "factory_board",
          description: "The items on the factory board, with their statuses and delivery dates.",
          inputSchema: z.object({}),
          run: async () =>
            (await fetchBoardItems()).slice(0, 60).map((i) => ({ orderNo: i.order.order_no, product: i.product, qty: i.qty, status: i.production_status, urgency: i.urgency, deliveryDate: i.order.delivery_date })),
        }),
      ],
      change: [],
      abilities: "Look up the factory board. They can't make changes through you.",
    };
  }
  if (person.type !== "staff") return { read: [], change: [], abilities: "Nothing in this app." };
  const role = person.role as AppRole;
  const db = channel === "app" ? ((await createClient()) as unknown as SupabaseClient) : (createAdminClient() as unknown as SupabaseClient);
  const change = channel === "app" ? staffChanges(role) : [];
  const read = staffReads(role, db, channel === "app");
  const developer = person.email === SUPPORT_OWNER_EMAIL && role !== "boss";
  if (developer) read.push(readTool({ name: "server_health", description: "Whether the sites are up, server load, and money alerts.", inputSchema: z.object({}), run: serverHealth }));
  // They read through the sign-in, which WhatsApp doesn't have.
  if (channel === "app") {
    const admin = staffAdminTools({ userId: person.id, role, email: person.email });
    read.push(...admin.read);
    change.push(...admin.change);
  }
  return { read, change, abilities: abilities(role, change, read) + (channel === "whatsapp" ? " On WhatsApp they can only look things up: changes are made in the app." : "") };
}
