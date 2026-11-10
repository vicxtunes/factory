import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { addExpenseCategory, decideExpense, endExpenseSchedule, moveMoney, payExpense, recordOtherMoney, voidExpense, voidOtherMoney } from "@repo/lib/books/actions";
import { applyWalletToInvoice, listInvoices, recordInvoicePayment, sendInvoiceReminders, updateInvoice } from "@repo/lib/invoices/actions";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";

import { changeTool, outcome, readTool, type ChangeTool } from "../toolbox";
import type { AssistantTool } from "../../server/tools";

// Money through Alexis (2026-11-10): invoices (reception and up) and the
// books (boss and supervisors), on cards that run the pages' own server
// actions. No money leaves through Alexis: sending a payout, refunds and
// withdrawals stay on their pages.

const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date as YYYY-MM-DD.");
const id = z.string().uuid();
const METHODS = ["cash", "bank_transfer", "mobile_money", "other"] as const;
const methodWords: Record<(typeof METHODS)[number], string> = { cash: "cash", bank_transfer: "bank transfer", mobile_money: "mobile money", other: "other" };

async function accountName(accountId: string): Promise<string> {
  const { data } = await createAdminClient().from("money_accounts").select("name").eq("id", accountId).maybeSingle();
  if (!data) throw new Error("That account doesn't exist. Look them up with money_accounts.");
  return data.name as string;
}

async function invoiceRow(invoiceId: string) {
  const { data } = await createAdminClient()
    .from("invoices")
    .select("id, invoice_no, order:orders!inner (order_no, client_name)")
    .eq("id", invoiceId)
    .maybeSingle<{ id: string; invoice_no: string; order: { order_no: string; client_name: string | null } }>();
  if (!data) throw new Error("That invoice doesn't exist. Look it up with invoices.");
  return data;
}

async function expenseRow(expenseId: string) {
  const { data } = await createAdminClient().from("expense_lines").select("id, name, amount, paid, category_name, recipient, voided_at").eq("id", expenseId).maybeSingle();
  if (!data) throw new Error("That expense doesn't exist. Look it up with expenses.");
  if (data.voided_at) throw new Error(`"${data.name}" was voided.`);
  return data as { id: string; name: string; amount: number; paid: number; category_name: string; recipient: string | null };
}

/** Invoices: whoever may use them (reception, supervisors, the boss). */
export function invoiceTools(): { read: AssistantTool[]; change: ChangeTool[] } {
  return {
    read: [
      readTool({
        name: "invoices",
        description: "Every invoice, newest first: id, number, order, client, issued, due, status, amount, paid and balance in UGX. Filter by status or search (client, invoice or order number).",
        inputSchema: z.object({ status: z.enum(["all", "unpaid", "partially_paid", "paid", "cancelled"]).nullable(), search: z.string().max(60).nullable() }),
        run: async ({ status, search }) => {
          const res = await listInvoices();
          if (!res.ok) return res.error;
          const q = search?.toLowerCase() ?? "";
          const rows = res.data.filter((r) => (!status || status === "all" || r.status === status) && (!q || [r.clientName, r.invoiceNo, r.orderNo].some((t) => t.toLowerCase().includes(q))));
          return { count: rows.length, owed: rows.reduce((s, r) => s + r.balance, 0), invoices: rows.slice(0, 100) };
        },
      }),
      readTool({
        name: "money_accounts",
        description: "The business's money accounts (cash, bank, mobile money) with their ids: where money was received into or paid from.",
        inputSchema: z.object({}),
        run: async () => (await createAdminClient().from("money_accounts").select("id, name, kind").eq("tenant_id", (await resolveTenantScope()).tenantId).order("name")).data,
      }),
    ],
    change: [
      changeTool({
        name: "record_invoice_payment",
        description:
          "Record money a client paid on an invoice outside the app (cash at the desk, bank, mobile money to the business number), with who sent it, when and into which account (money_accounts). Mobile money needs the sender's phone; bank needs the reference. If they paid more than the balance, extra goes to their wallet unless said otherwise.",
        inputSchema: z.object({
          invoiceId: id,
          amount: z.number().int().positive(),
          method: z.enum(METHODS),
          senderName: z.string().trim().min(1).max(120),
          senderPhone: z.string().max(30).nullable(),
          reference: z.string().max(100).nullable(),
          receivedOn: day,
          accountId: id,
          note: z.string().max(500).nullable(),
        }),
        card: async (p) => {
          const [inv, account] = await Promise.all([invoiceRow(p.invoiceId), accountName(p.accountId)]);
          return {
            title: `Record ${ugx(p.amount)} paid on invoice ${inv.invoice_no}`,
            lines: [`Order ${inv.order.order_no}, ${inv.order.client_name ?? "unknown client"}`, `${methodWords[p.method]} from ${p.senderName}${p.senderPhone ? ` (${p.senderPhone})` : ""}`, `Received ${p.receivedOn} into ${account}`, ...(p.reference ? [`Reference: ${p.reference}`] : [])],
          };
        },
        run: async (p) => {
          const res = await recordInvoicePayment(p.invoiceId, {
            amount: p.amount,
            method: p.method,
            reference: p.reference,
            note: p.note,
            excessDisposition: "wallet",
            source: { senderName: p.senderName, senderPhone: p.senderPhone, receivedOn: p.receivedOn, accountId: p.accountId },
          });
          if (!res.ok) return res;
          return { ok: true, done: `${ugx(res.data.applied)} is on the invoice${res.data.toWallet ? `, ${ugx(res.data.toWallet)} went to the client's wallet` : ""}. Balance: ${ugx(res.data.invoice.balance)}.` };
        },
      }),
      changeTool({
        name: "pay_invoice_from_wallet",
        description: "Use the client's wallet balance to pay what it can of an invoice.",
        inputSchema: z.object({ invoiceId: id }),
        card: async ({ invoiceId }) => {
          const inv = await invoiceRow(invoiceId);
          return { title: `Pay invoice ${inv.invoice_no} from the client's wallet`, lines: [`Order ${inv.order.order_no}, ${inv.order.client_name ?? "unknown client"}`, "As much as the wallet holds, up to the balance"] };
        },
        run: async ({ invoiceId }) => {
          const res = await applyWalletToInvoice(invoiceId);
          return res.ok ? { ok: true, done: `${ugx(res.data.applied)} came from the wallet. Balance: ${ugx(res.data.invoice.balance)}.` } : res;
        },
      }),
      changeTool({
        name: "edit_invoice",
        description: "Change an invoice's due date or notes (give what changes).",
        inputSchema: z.object({ invoiceId: id, dueDate: day.nullable(), notes: z.string().max(500).nullable() }),
        card: async ({ invoiceId, dueDate, notes }) => {
          const inv = await invoiceRow(invoiceId);
          if (!dueDate && notes == null) throw new Error("Nothing changes: give a due date or notes.");
          return { title: `Invoice ${inv.invoice_no}: ${dueDate ? `due ${dueDate}` : "new notes"}`, lines: [`Order ${inv.order.order_no}, ${inv.order.client_name ?? "unknown client"}`, ...(notes ? [`Notes: ${notes}`] : [])] };
        },
        run: async ({ invoiceId, dueDate, notes }) => outcome(await updateInvoice(invoiceId, { ...(dueDate ? { dueDate } : {}), ...(notes != null ? { notes } : {}) }), "The invoice is updated."),
      }),
      changeTool({
        name: "send_payment_reminders",
        description: "Remind every client who owes on an invoice (a push and an email, at most once a day each).",
        inputSchema: z.object({}),
        card: async () => {
          const res = await listInvoices();
          const owing = res.ok ? res.data.filter((r) => r.balance > 0 && r.status !== "cancelled") : [];
          return { title: "Send payment reminders", lines: [`${new Set(owing.map((r) => r.clientName)).size} clients owe ${ugx(owing.reduce((s, r) => s + r.balance, 0))}`, "Anyone reminded today is skipped"] };
        },
        run: async () => {
          const res = await sendInvoiceReminders();
          return res.ok ? { ok: true, done: `Reminders sent: ${JSON.stringify(res.data)}.` } : res;
        },
      }),
    ],
  };
}

/** The books: the boss and supervisors (the Accounts pages). `boss`: approving expenses. */
export function booksChanges(boss: boolean): ChangeTool[] {
  const tools: ChangeTool[] = [
    changeTool({
      name: "pay_expense",
      description:
        "Record a payment already made on an expense (id from expenses), from which account (money_accounts), how and when. actual: the real amount when an estimated expense turns out different. Doesn't send money: it records it.",
      inputSchema: z.object({
        expenseId: id,
        amount: z.number().int().positive(),
        actual: z.number().int().positive().nullable(),
        paidOn: day,
        accountId: id,
        method: z.enum(METHODS),
        phone: z.string().max(30).nullable(),
        reference: z.string().max(100).nullable(),
        note: z.string().max(500).nullable(),
      }),
      card: async (p) => {
        const [e, account] = await Promise.all([expenseRow(p.expenseId), accountName(p.accountId)]);
        const amount = p.actual ?? e.amount;
        return {
          title: `Pay ${ugx(p.amount)} on ${e.name}`,
          lines: [`${e.category_name}${e.recipient ? `, to ${e.recipient}` : ""}`, `Owed before: ${ugx(Math.max(amount - e.paid, 0))}, after: ${ugx(Math.max(amount - e.paid - p.amount, 0))}`, `${methodWords[p.method]} from ${account} on ${p.paidOn}`],
        };
      },
      run: async (p) => outcome(await payExpense({ ...p, id: randomUUID() }), "The payment is recorded."),
    }),
    changeTool({
      name: "void_expense",
      description: "Cancel an expense entered by mistake, with the reason. It stays in the history as voided.",
      inputSchema: z.object({ expenseId: id, reason: z.string().trim().min(3).max(500) }),
      card: async ({ expenseId, reason }) => {
        const e = await expenseRow(expenseId);
        return { title: `Void expense ${e.name}, ${ugx(e.amount)}`, lines: [`${e.category_name}`, `Reason: ${reason}`] };
      },
      run: async ({ expenseId, reason }) => outcome(await voidExpense({ id: expenseId, reason }), "The expense is voided."),
    }),
    changeTool({
      name: "end_repeating_expense",
      description: "Stop a repeating expense (id from expenses' repeating list): no more come due.",
      inputSchema: z.object({ scheduleId: id }),
      card: async ({ scheduleId }) => {
        const { data } = await createAdminClient().from("expense_schedules").select("name, amount, every, ended_at").eq("id", scheduleId).maybeSingle();
        if (!data) throw new Error("That repeating expense doesn't exist.");
        if (data.ended_at) throw new Error(`"${data.name}" has already ended.`);
        return { title: `Stop repeating ${data.name}`, lines: [`${ugx(Number(data.amount))} every ${data.every}`, "Ones already due stay"] };
      },
      run: async ({ scheduleId }) => outcome(await endExpenseSchedule(scheduleId), "It won't come due again."),
    }),
    changeTool({
      name: "add_expense_category",
      description: "Add an expense category.",
      inputSchema: z.object({ name: z.string().trim().min(2).max(60) }),
      card: async ({ name }) => ({ title: `New expense category: ${name}`, lines: [] }),
      run: async ({ name }) => outcome(await addExpenseCategory({ name }), `${name} is a category now.`),
    }),
    changeTool({
      name: "record_other_money_in",
      description: "Record money in that isn't from a client: owner (the owner putting money in), other_income, or other. With who sent it, how, when and into which account.",
      inputSchema: z.object({
        kind: z.enum(["owner", "other_income", "other"]),
        amount: z.number().int().positive(),
        senderName: z.string().trim().min(1).max(120),
        senderPhone: z.string().max(30).nullable(),
        method: z.enum(METHODS),
        reference: z.string().max(100).nullable(),
        receivedOn: day,
        accountId: id,
        note: z.string().max(500).nullable(),
      }),
      card: async (m) => ({
        title: `Record ${ugx(m.amount)} in from ${m.senderName}`,
        lines: [{ owner: "The owner putting money in", other_income: "Other income", other: "Other" }[m.kind], `${methodWords[m.method]} into ${await accountName(m.accountId)} on ${m.receivedOn}`, ...(m.note ? [m.note] : [])],
      }),
      run: async (m) => outcome(await recordOtherMoney(m), "The money is recorded."),
    }),
    changeTool({
      name: "void_other_money_in",
      description: "Cancel a money-in record that isn't from a client (from payments' otherMoneyIn), with the reason.",
      inputSchema: z.object({ id, reason: z.string().trim().min(3).max(500) }),
      card: async ({ id: rowId, reason }) => {
        const { data } = await createAdminClient().from("other_money_in").select("amount, sender_name, received_on").eq("id", rowId).maybeSingle();
        if (!data) throw new Error("That record doesn't exist.");
        return { title: `Void ${ugx(Number(data.amount))} from ${data.sender_name}`, lines: [`Received ${data.received_on}`, `Reason: ${reason}`] };
      },
      run: async (v) => outcome(await voidOtherMoney(v), "The record is voided."),
    }),
    changeTool({
      name: "move_money",
      description: "Record money moved between the business's own accounts (e.g. cash banked, mobile money withdrawn to cash). Ids from money_accounts.",
      inputSchema: z.object({ fromAccountId: id, toAccountId: id, amount: z.number().int().positive(), movedOn: day, reference: z.string().max(100).nullable(), note: z.string().max(500).nullable() }),
      card: async (m) => {
        if (m.fromAccountId === m.toAccountId) throw new Error("Choose two different accounts.");
        const [from, to] = await Promise.all([accountName(m.fromAccountId), accountName(m.toAccountId)]);
        return { title: `Move ${ugx(m.amount)} from ${from} to ${to}`, lines: [`On ${m.movedOn}`, ...(m.reference ? [`Reference: ${m.reference}`] : [])] };
      },
      run: async (m) => outcome(await moveMoney({ ...m, id: randomUUID() }), "The move is recorded."),
    }),
  ];
  if (boss) {
    tools.push(
      changeTool({
        name: "approve_expense",
        description: "Approve or reject an expense waiting for the boss's approval, with an optional note.",
        inputSchema: z.object({ expenseId: id, approve: z.boolean(), note: z.string().max(500).nullable() }),
        card: async ({ expenseId, approve, note }) => {
          const e = await expenseRow(expenseId);
          return { title: `${approve ? "Approve" : "Reject"} expense ${e.name}, ${ugx(e.amount)}`, lines: [`${e.category_name}${e.recipient ? `, to ${e.recipient}` : ""}`, ...(note ? [`Note: ${note}`] : [])] };
        },
        run: async ({ expenseId, approve, note }) => outcome(await decideExpense({ id: expenseId, approve, note }), approve ? "The expense is approved." : "The expense is rejected."),
      }),
    );
  }
  return tools;
}
