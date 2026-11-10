import "server-only";

import { z } from "zod";

import { accounting } from "@repo/lib/accounting/index.server";
import { expenseBalance, expenseStatus } from "@repo/lib/books/expenses";
import { expensesBoard } from "@repo/lib/books/expenses-server";
import { otherMoneyIn } from "@repo/lib/books/server";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import type { AssistantTool } from "../../server/tools";
import { readTool } from "../toolbox";

// Reads that answer any question about Aming's money and, for the boss, about
// anything in the business (2026-11-10). The boss asked "where is each amount
// coming from?" and "include every salary": the old tools gave the latest 5
// payments and only unpaid expenses, so Alexis had to send them to a page.
// These return everything for the period asked, with totals, and the boss's
// database reader sees every table, so any follow-up can be fetched.

const PRESETS = ["today", "yesterday", "this_week", "this_month", "last_month", "this_year", "all", "custom"] as const;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date as YYYY-MM-DD.");
const period = {
  period: z.enum(PRESETS).describe("custom: give from and to."),
  from: day.nullable().describe("First day, for custom."),
  to: day.nullable().describe("Last day, for custom."),
};
/** Lines past this many are counted in the totals but not listed. */
const MAX_LINES = 300;
const listed = <T>(lines: T[]) => ({ count: lines.length, lines: lines.slice(0, MAX_LINES), ...(lines.length > MAX_LINES ? { note: `Only the first ${MAX_LINES} are listed; the totals cover all ${lines.length}.` } : {}) });
const has = (text: string | null | undefined, search: string) => (text ?? "").toLowerCase().includes(search.toLowerCase());

/** Payments, sales and expenses: for whoever may view Accounts (boss and supervisors). */
export function accountsTools(): AssistantTool[] {
  return [
    readTool({
      name: "payments",
      description:
        "Every payment received in a period, newest first: when, amount in UGX, channel, client, order, reference, sender and who recorded it, with the total, the total per channel and per recorder. Also money in that isn't from clients (loans, other). Use it to say where any amount came from.",
      inputSchema: z.object({ ...period, search: z.string().max(60).nullable().describe("Client, order number, reference or sender, to narrow it.") }),
      run: async ({ period: preset, from, to, search }) => {
        const scope = await resolveTenantScope();
        const view = await accounting.payments(scope, { preset, from, to });
        const lines = search
          ? view.lines.filter((l) => [l.customerName, l.orderNo, l.reference, l.senderName, l.senderPhone].some((t) => has(t, search)))
          : view.lines;
        const other = await otherMoneyIn(scope, { from: view.period.fromDate, to: view.period.toDate });
        return {
          period: view.period,
          totals: search ? { total: lines.reduce((s, l) => s + l.amount, 0), count: lines.length } : view.totals,
          ...listed(
            lines.map((l) => ({ at: l.receivedAt, amount: l.amount, channel: l.channel, client: l.customerName, kind: l.kind, orderNo: l.orderNo, reference: l.reference, sender: l.senderName, senderPhone: l.senderPhone, recordedBy: l.recordedBy })),
          ),
          otherMoneyIn: other.map((o) => ({ on: o.receivedOn, kind: o.kind, amount: o.amount, from: o.senderName, method: o.method, account: o.accountName, note: o.note })),
        };
      },
    }),
    readTool({
      name: "sales",
      description:
        "Every invoiced order (a sale) in a period: invoice and order number, client, issue and due date, total, discount, paid, outstanding, status and whether it's overdue, all in UGX, with totals. Filter by status or search.",
      inputSchema: z.object({
        ...period,
        status: z.enum(["all", "unpaid", "part_paid", "paid", "overdue", "cancelled"]).nullable(),
        search: z.string().max(60).nullable().describe("Client, invoice or order number."),
      }),
      run: async ({ period: preset, from, to, status, search }) => {
        const view = await accounting.sales(await resolveTenantScope(), { preset, from, to });
        const lines = view.lines.filter(
          (l) =>
            (!status || status === "all" || (status === "overdue" ? l.overdue : status === "cancelled" ? l.cancelled : l.status === status)) &&
            (!search || [l.customerName, l.number, l.orderNo].some((t) => has(t, search))),
        );
        const live = lines.filter((l) => !l.cancelled);
        return {
          period: view.period,
          totals: status || search ? { count: live.length, total: live.reduce((s, l) => s + l.total, 0), paid: live.reduce((s, l) => s + l.paid, 0), outstanding: live.reduce((s, l) => s + l.outstanding, 0) } : view.totals,
          ...listed(lines.map((l) => ({ invoice: l.number, orderNo: l.orderNo, client: l.customerName, issued: l.issuedAt.slice(0, 10), due: l.dueDate, total: l.total, discount: l.discount, paid: l.paid, outstanding: l.outstanding, status: l.status, overdue: l.overdue, cancelled: l.cancelled }))),
        };
      },
    }),
    readTool({
      name: "expenses",
      description:
        "Every expense, paid or not, with its category, amount, paid, balance, date, due date, status (overdue first) and who it was paid to, in UGX, plus every repeating expense (rent, salaries…) with its category and how often. Filter by status, category name, a period (by expense date) or search. For salaries, use the category, not the name.",
      inputSchema: z.object({
        status: z.enum(["all", "owed", "overdue", "paid", "waiting"]).nullable().describe("owed: anything with a balance; waiting: waiting for approval."),
        category: z.string().max(60).nullable().describe("Part of a category name, e.g. Salaries or Rent."),
        from: day.nullable(),
        to: day.nullable(),
        search: z.string().max(60).nullable().describe("Name, recipient or description."),
      }),
      run: async ({ status, category, from, to, search }) => {
        const board = await expensesBoard(await resolveTenantScope());
        const lines = board.lines
          .map((e) => ({ ...e, state: expenseStatus(e, board.today), balance: expenseBalance(e) }))
          .filter(
            (e) =>
              e.state !== "voided" &&
              (!status || status === "all" || (status === "owed" ? e.balance > 0 : status === "overdue" ? e.state === "overdue" : status === "paid" ? e.state === "paid" : e.state === "waiting")) &&
              (!category || has(e.categoryName, category)) &&
              (!from || e.spentOn >= from) &&
              (!to || e.spentOn <= to) &&
              (!search || [e.name, e.recipient, e.description].some((t) => has(t, search))),
          )
          .sort((a, b) => Number(b.state === "overdue") - Number(a.state === "overdue") || b.spentOn.localeCompare(a.spentOn));
        const schedules = board.schedules.filter((s) => !s.endedAt && (!category || has(s.categoryName, category)) && (!search || [s.name, s.recipient].some((t) => has(t, search))));
        return {
          today: board.today,
          totals: { count: lines.length, amount: lines.reduce((s, e) => s + e.amount, 0), paid: lines.reduce((s, e) => s + Math.min(e.paid, e.amount), 0), balance: lines.reduce((s, e) => s + e.balance, 0), overdue: lines.filter((e) => e.state === "overdue").reduce((s, e) => s + e.balance, 0) },
          ...listed(lines.map((e) => ({ id: e.id, name: e.name, category: e.categoryName, amount: e.amount, estimate: e.amountIsEstimate, paid: e.paid, balance: e.balance, status: e.state, date: e.spentOn, due: e.dueOn, repeats: e.scheduleEvery, paidTo: e.recipient, note: e.description, recordedBy: e.recordedBy }))),
          repeating: schedules.map((s) => ({ id: s.id, name: s.name, category: s.categoryName, amount: s.amount, varies: s.varies, every: s.every, since: s.firstDueOn, paidTo: s.recipient })),
        };
      },
    }),
  ];
}

const GUIDE = `Read-only. Aming's own records: orders, order_items, invoices, clients, wallets, payments, order_payment_receipts, expenses (expense_lines view has category names and paid), expense_schedules, products, materials, agents, workers, designers, profiles (staff), chat_messages, notifications, order_item_media and order_item_drive_links (an order item's Drive: its files), and the views accounting_money_in (payments received), accounting_sale_documents (sales), money_day_lines. Rows with a tenant_id belong to a business: Aming's own is default_tenant_id(); any other tenant_id is a studio or vendor (tenants), whose bookings, customers, projects, tasks, files, file_folders (their Drive), billing_documents and offerings are theirs. Times are UTC: for Kampala days use (created_at at time zone 'Africa/Kampala')::date. Money is in UGX.`;

let synced: Promise<unknown> | null = null;

/** Run one read-only query as alexis_reader (migration 20270101100000), after making sure it can see every newer table. */
async function read(query: string, maxRows: number): Promise<unknown> {
  const db = createAdminClient();
  synced ??= Promise.resolve(db.rpc("alexis_reader_sync")).catch(() => (synced = null));
  await synced;
  const { data, error } = await db.rpc("alexis_read", { query: query.trim().replace(/;+\s*$/, ""), max_rows: maxRows });
  if (error) return `The query failed: ${error.message}. Check the table and column names with database_tables and try again.`;
  return data;
}

/** The boss's reader: every feature's records, including what no other tool shows. Never changes anything. */
export function databaseTools(): AssistantTool[] {
  return [
    readTool({
      name: "database_tables",
      description: `The business's database: with no tables given, every table and view with how many rows it has; with tables, their columns and types and what they link to. Use it before ask_database. ${GUIDE}`,
      inputSchema: z.object({ tables: z.array(z.string().regex(/^[a-z0-9_]+$/)).max(8).nullable() }),
      run: async ({ tables }) => {
        // information_schema shows alexis_reader only the columns it may read: secrets never appear.
        if (!tables?.length) {
          return read(
            `select c.table_name as table, k.relkind = 'v' as is_view, greatest(k.reltuples, 0)::bigint as rows_about
             from (select distinct table_name from information_schema.columns where table_schema = 'public') c
             join pg_class k on k.relname = c.table_name and k.relnamespace = 'public'::regnamespace
             order by 1`,
            500,
          );
        }
        const list = tables.map((t) => `'${t}'`).join(",");
        const [columns, links] = await Promise.all([
          read(
            `select table_name as table, string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) as columns
             from information_schema.columns where table_schema = 'public' and table_name in (${list}) group by 1 order by 1`,
            20,
          ),
          read(
            `select conrelid::regclass::text as table,
                    (select string_agg(a.attname, ', ') from unnest(conkey) n join pg_attribute a on a.attrelid = conrelid and a.attnum = n) || ' -> ' || confrelid::regclass::text as link
             from pg_constraint where contype = 'f' and conrelid::regclass::text in (${list}) order by 1`,
            200,
          ),
        ]);
        return { columns, links };
      },
    }),
    readTool({
      name: "ask_database",
      description: `Run one PostgreSQL SELECT (or WITH … SELECT) on the business's database and get the rows back (up to max_rows, 200 by default, at most 500). Use it for anything the other tools don't show, or to dig deeper: any feature, any period, totals, counts, comparisons. Prefer sums and counts in SQL over listing rows. It can't change anything. ${GUIDE}`,
      inputSchema: z.object({ sql: z.string().min(1).max(6000), maxRows: z.number().int().min(1).max(500).nullable() }),
      run: async ({ sql, maxRows }) => read(sql, maxRows ?? 200),
    }),
  ];
}
