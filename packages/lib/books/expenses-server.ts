import "server-only";

// The only file that touches the database for expenses. Every rule that keeps
// the money right lives in the database (20261204100000_expenses.sql), so no
// screen or script can get round it.

import { randomUUID } from "crypto";

import { localDate } from "@repo/lib/accounting/core/period";
import { AppError } from "@repo/lib/kernel/core";
import { safeStorageSegment } from "@repo/lib/storage/client";
import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { ExpenseCategory, ExpenseDetail, ExpenseEvery, ExpenseLine, ExpenseMonth, ExpenseSchedule, ExpenseSummary, UpcomingBill } from "./expenses";
import { EXPENSE_DOCUMENTS_BUCKET } from "./expenses";
import type { ExpenseInput, ExpensePaymentInput, ScheduleEditInput, ScheduleInput, ScheduleStopInput } from "./schema";
import { failBooks as fail } from "./server";

type Actor = { id: string; name: string };

const LINK_SECONDS = 60 * 10;
/** How far ahead Coming up looks. */
export const UPCOMING_DAYS = 30;

interface LineRow {
  id: string;
  category: string;
  category_name: string;
  name: string;
  description: string | null;
  recipient: string | null;
  amount: number | string;
  amount_is_estimate: boolean;
  spent_on: string;
  due_on: string | null;
  schedule_id: string | null;
  schedule_every: ExpenseEvery | null;
  schedule_every_count: number | null;
  paid_from: string | null;
  automatic: boolean;
  paid: number | string;
  approval: ExpenseLine["approval"];
  approved_by_name: string | null;
  approved_at: string | null;
  approval_note: string | null;
  actor_name: string;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
  voided_by_name: string | null;
  voided_with_schedule: boolean;
  restored_at: string | null;
  restored_by_name: string | null;
  paid_from_accounts: string[] | null;
  pay_phone: string | null;
  payout_sending: boolean;
  autopay_at: string | null;
  autopay_held_at: string | null;
  autopay_held_by_name: string | null;
  autopay_hold_reason: string | null;
}

interface ScheduleRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  category_name: string;
  recipient: string | null;
  amount: number | string;
  varies: boolean;
  every: ExpenseEvery;
  every_count: number;
  ends_on: string | null;
  times: number | null;
  next_created_on: string | null;
  bills: number;
  paid_total: number | string;
  actor_name: string;
  created_at: string;
  paused_at: string | null;
  paused_by_name: string | null;
  edited_at: string | null;
  edited_by_name: string | null;
  ended_at: string | null;
  ended_by_name: string | null;
  pay_phone: string | null;
  send_at: string;
}

function toSchedule(s: ScheduleRow): ExpenseSchedule {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    categoryName: s.category_name,
    recipient: s.recipient,
    amount: Number(s.amount),
    varies: s.varies,
    every: s.every,
    everyCount: s.every_count,
    endsOn: s.ends_on,
    times: s.times,
    nextCreatedOn: s.next_created_on,
    bills: s.bills,
    paidTotal: Number(s.paid_total),
    recordedBy: s.actor_name,
    recordedAt: s.created_at,
    pausedAt: s.paused_at,
    pausedBy: s.paused_by_name,
    editedAt: s.edited_at,
    editedBy: s.edited_by_name,
    endedAt: s.ended_at,
    endedBy: s.ended_by_name,
    payPhone: s.pay_phone,
    sendAt: s.send_at,
  };
}

function toLine(r: LineRow): ExpenseLine {
  return {
    id: r.id,
    category: r.category,
    categoryName: r.category_name,
    name: r.name,
    description: r.description,
    recipient: r.recipient,
    amount: Number(r.amount),
    amountIsEstimate: r.amount_is_estimate,
    spentOn: r.spent_on,
    dueOn: r.due_on,
    scheduleId: r.schedule_id,
    scheduleEvery: r.schedule_every,
    scheduleEveryCount: r.schedule_every_count,
    automatic: r.automatic,
    onCredit: r.paid_from === "on_credit",
    paid: Number(r.paid),
    approval: r.approval,
    approvedBy: r.approved_by_name,
    approvedAt: r.approved_at,
    approvalNote: r.approval_note,
    recordedBy: r.actor_name,
    recordedAt: r.created_at,
    voidedAt: r.voided_at,
    voidReason: r.void_reason,
    voidedBy: r.voided_by_name,
    voidedWithSchedule: r.voided_with_schedule,
    restoredAt: r.restored_at,
    restoredBy: r.restored_by_name,
    paidFrom: r.paid_from_accounts ?? [],
    payPhone: r.pay_phone,
    payoutSending: r.payout_sending,
    autopayAt: r.autopay_at,
    autopayHeldAt: r.autopay_held_at,
    autopayHeldBy: r.autopay_held_by_name,
    autopayHoldReason: r.autopay_hold_reason,
  };
}

/**
 * Everything Accounts → Expenses lists: the period's expenses, plus whatever is
 * still owed and whatever a pause or cancel voided (it can be restored),
 * however old. Anything a schedule now owes is created first.
 */
export async function expensesBoard(scope: TenantScope, period: { fromDate: string | null; toDate: string | null }) {
  const db = createAdminClient();
  const today = localDate(new Date(), scope.timeZone);
  const { error: dueError } = await db.rpc("expense_generate_due", { p_today: today });
  if (dueError) fail(dueError);
  let inPeriod = db.from("expense_lines").select("*").eq("tenant_id", scope.tenantId);
  // A recurring bill belongs to its due day, the rest to the day spent: both are asked for, the screen keeps the right one.
  const { fromDate: from, toDate: to } = period;
  if (from && to) inPeriod = inPeriod.or(`and(spent_on.gte.${from},spent_on.lte.${to}),and(due_on.gte.${from},due_on.lte.${to})`);
  else if (from) inPeriod = inPeriod.or(`spent_on.gte.${from},due_on.gte.${from}`);
  else if (to) inPeriod = inPeriod.or(`spent_on.lte.${to},due_on.lte.${to}`);
  const [lines, open, restorable, categories, schedules, upcoming, settings, fees] = await Promise.all([
    inPeriod.order("spent_on", { ascending: false }).order("created_at", { ascending: false }).limit(5000).returns<LineRow[]>(),
    db.rpc("expense_open_lines"),
    db.from("expense_lines").select("*").eq("tenant_id", scope.tenantId).eq("voided_with_schedule", true).not("voided_at", "is", null).returns<LineRow[]>(),
    db.from("expense_categories").select("key, name, automatic").eq("tenant_id", scope.tenantId).order("created_at").order("name").returns<ExpenseCategory[]>(),
    db.from("expense_schedule_lines").select("*").eq("tenant_id", scope.tenantId).order("created_at", { ascending: false }).returns<ScheduleRow[]>(),
    db.rpc("expense_schedule_upcoming", { p_today: today, p_days: UPCOMING_DAYS }),
    db.from("expense_settings").select("approval_above, autopay_up_to").eq("tenant_id", scope.tenantId).maybeSingle<{ approval_above: number | string | null; autopay_up_to: number | string | null }>(),
    db.from("hivepay_send_fees").select("up_to, fee").order("up_to").returns<{ up_to: number | string; fee: number | string }[]>(),
  ]);
  for (const r of [lines, open, restorable, categories, schedules, upcoming, settings, fees]) if (r.error) fail(r.error);
  const byId = new Map<string, LineRow>();
  for (const l of [...(lines.data ?? []), ...((open.data ?? []) as LineRow[]), ...(restorable.data ?? [])]) byId.set(l.id, l);
  return {
    today,
    lines: [...byId.values()].map(toLine),
    categories: categories.data ?? [],
    approvalAbove: settings.data?.approval_above == null ? null : Number(settings.data.approval_above),
    autopayUpTo: settings.data?.autopay_up_to == null ? null : Number(settings.data.autopay_up_to),
    sendFees: (fees.data ?? []).map((f) => ({ upTo: Number(f.up_to), fee: Number(f.fee) })),
    schedules: (schedules.data ?? []).map(toSchedule),
    upcoming: ((upcoming.data ?? []) as { schedule_id: string; due_on: string }[]).map((u): UpcomingBill => ({ scheduleId: u.schedule_id, dueOn: u.due_on })),
  };
}

/** The figures on top of Accounts → Expenses. Run after anything a schedule owes has been created. */
export async function expenseDashboard(scope: TenantScope, period: { fromDate: string | null; toDate: string | null }): Promise<ExpenseSummary> {
  const { data, error } = await createAdminClient().rpc("expense_dashboard", { p_from: period.fromDate, p_to: period.toDate, p_today: localDate(new Date(), scope.timeZone) });
  if (error) fail(error);
  return data as ExpenseSummary;
}

/** What was spent each month, the 12 months up to the period's end (or today). */
export async function expenseMonths(scope: TenantScope, period: { toDate: string | null }): Promise<ExpenseMonth[]> {
  const to = period.toDate ?? localDate(new Date(), scope.timeZone);
  const { data, error } = await createAdminClient().rpc("expense_months", { p_to: to, p_months: 12 });
  if (error) fail(error);
  return ((data ?? []) as { month: string; total: number | string; paid: number | string }[]).map((m) => ({ month: m.month, total: Number(m.total), paid: Number(m.paid) }));
}

/** All the money in and out over a period, as Today counts it, for Accounts → Overview. */
export async function moneyFlow(period: { fromDate: string | null; toDate: string | null }): Promise<{ moneyIn: number; moneyOut: number }> {
  const { data, error } = await createAdminClient().rpc("money_flow", { p_from: period.fromDate, p_to: period.toDate });
  if (error) fail(error);
  return data as { moneyIn: number; moneyOut: number };
}

/** Creates anything a schedule now owes, without waiting for someone to open the page. */
export async function createDueExpenses(today: string): Promise<void> {
  const { error } = await createAdminClient().rpc("expense_generate_due", { p_today: today });
  if (error) fail(error);
}

/** Claims the day's reminder: true only the first time, so it goes out once even across restarts. */
export async function claimExpenseReminder(day: string): Promise<boolean> {
  const { error } = await createAdminClient().from("expense_reminders").insert({ day });
  if (!error) return true;
  if (error.code === "23505") return false;
  fail(error);
}

export async function openExpenses(): Promise<ExpenseLine[]> {
  const { data, error } = await createAdminClient().rpc("expense_open_lines");
  if (error) fail(error);
  return ((data ?? []) as LineRow[]).map(toLine);
}

export async function recordExpense(input: ExpenseInput, isBoss: boolean, actor: Actor): Promise<void> {
  const { error } = await createAdminClient().rpc("expense_record", {
    p_id: input.id,
    p_name: input.name,
    p_description: input.description,
    p_category: input.category,
    p_amount: input.amount,
    p_recipient: input.recipient,
    p_spent_on: input.spentOn,
    p_due_on: input.dueOn,
    p_is_boss: isBoss,
    p_actor_id: actor.id,
    p_actor_name: actor.name,
  });
  if (error) fail(error);
}

export async function addSchedule(input: ScheduleInput, isBoss: boolean, actor: Actor): Promise<void> {
  const { error } = await createAdminClient().rpc("expense_schedule_add", {
    p_id: input.id,
    p_name: input.name,
    p_description: input.description,
    p_category: input.category,
    p_amount: input.amount,
    p_varies: input.varies,
    p_every: input.every,
    p_every_count: input.everyCount,
    p_first_due_on: input.firstDueOn,
    p_ends_on: input.endsOn,
    p_times: input.times,
    p_recipient: input.recipient,
    p_is_boss: isBoss,
    p_actor_id: actor.id,
    p_actor_name: actor.name,
  });
  if (error) fail(error);
}

/** Bills already created stay as they are; the next one is due on nextDueOn. */
export async function editSchedule(input: ScheduleEditInput, isBoss: boolean, actor: Actor): Promise<void> {
  const { error } = await createAdminClient().rpc("expense_schedule_edit", {
    p_id: input.id,
    p_name: input.name,
    p_description: input.description,
    p_category: input.category,
    p_amount: input.amount,
    p_varies: input.varies,
    p_every: input.every,
    p_every_count: input.everyCount,
    p_next_due_on: input.nextDueOn,
    p_ends_on: input.endsOn,
    p_times: input.times,
    p_recipient: input.recipient,
    p_is_boss: isBoss,
    p_actor_name: actor.name,
  });
  if (error) fail(error);
}

/** Pause or cancel, voiding the unpaid bills chosen. Returns how many were voided. */
export async function stopSchedule(input: ScheduleStopInput, byName: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("expense_schedule_stop", { p_id: input.id, p_end: input.end, p_void: input.voidIds, p_actor_name: byName });
  if (error) fail(error);
  return Number(data ?? 0);
}

/** What fell due while paused is skipped. */
/** Autopay's number (null stops it) and time of day for a recurring bill, on its bills not yet paid too. */
export async function setScheduleAutopay(id: string, phone: string | null, sendAt: string): Promise<void> {
  const { error } = await createAdminClient().rpc("expense_schedule_set_autopay", { p_id: id, p_phone: phone, p_send_at: sendAt });
  if (error) fail(error);
}

export async function resumeSchedule(id: string, byName: string): Promise<void> {
  const { error } = await createAdminClient().rpc("expense_schedule_resume", { p_id: id, p_actor_name: byName });
  if (error) fail(error);
}

/** Undoes a void made with a pause or cancel. */
export async function restoreExpense(id: string, byName: string): Promise<void> {
  const { error } = await createAdminClient().rpc("expense_restore", { p_expense: id, p_actor_name: byName });
  if (error) fail(error);
}

export async function pay(input: ExpensePaymentInput, isBoss: boolean, actor: Actor): Promise<void> {
  const { error } = await createAdminClient().rpc("expense_pay", {
    p_id: input.id,
    p_expense: input.expenseId,
    p_amount: input.amount,
    p_actual: input.actual,
    p_paid_on: input.paidOn,
    p_account: input.accountId,
    p_method: input.method,
    p_phone: input.phone,
    p_reference: input.reference,
    p_note: input.note,
    p_is_boss: isBoss,
    p_actor_id: actor.id,
    p_actor_name: actor.name,
  });
  if (error) fail(error);
}

export async function voidPayment(id: string, reason: string, byName: string): Promise<void> {
  const { error } = await createAdminClient().from("expense_payments").update({ voided_at: new Date().toISOString(), void_reason: reason, voided_by_name: byName }).eq("id", id).is("voided_at", null);
  if (error) fail(error);
}

export async function voidExpense(id: string, reason: string, byName: string): Promise<void> {
  const { error } = await createAdminClient().rpc("expense_void", { p_expense: id, p_reason: reason, p_actor_name: byName });
  if (error) fail(error);
}

export async function decide(id: string, approve: boolean, note: string | null, byName: string): Promise<void> {
  const { error } = await createAdminClient().rpc("expense_decide", { p_expense: id, p_approve: approve, p_note: note, p_actor_name: byName });
  if (error) fail(error);
}

export async function setApprovalLimit(above: number | null, byName: string): Promise<void> {
  const { error } = await createAdminClient().from("expense_settings").upsert({ approval_above: above, updated_by_name: byName, updated_at: new Date().toISOString() });
  if (error) fail(error);
}

/** Autopay sends by itself up to this much (null: no limit). Bills warned of that are now above it wait again. */
/** The boss saves HivePay's sending fee bands (owner, 2026-11-14: Aming pays the fee on top of what agents and suppliers receive). */
export async function setSendFees(bands: { upTo: number; fee: number }[], byName: string): Promise<void> {
  const { error } = await createAdminClient().rpc("hivepay_send_fees_set", { p_bands: bands.map((b) => ({ up_to: b.upTo, fee: b.fee })), p_by: byName });
  if (error) fail(error);
}

export async function setAutopayLimit(upTo: number | null, byName: string, today: string): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.from("expense_settings").upsert({ autopay_up_to: upTo, updated_by_name: byName, updated_at: new Date().toISOString() });
  if (error) fail(error);
  const { error: forgot } = await db.rpc("expense_autopay_forget", { p_today: today });
  if (forgot) fail(forgot);
}

/** The boss holds a bill that would go by itself: it waits for Approve and send. */
export async function holdAutopay(id: string, byName: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("expenses")
    .update({ autopay_held_at: new Date().toISOString(), autopay_held_by_name: byName })
    .eq("id", id)
    .is("autopay_held_at", null)
    .is("voided_at", null);
  if (error) fail(error);
}

export async function addCategory(name: string): Promise<ExpenseCategory> {
  const { data, error } = await createAdminClient().from("expense_categories").insert({ key: randomUUID(), name }).select("key, name, automatic").single<ExpenseCategory>();
  if (error?.code === "23505") throw new AppError("There's already a category with that name.");
  if (error || !data) fail(error ?? { message: "no category returned" });
  return data;
}

export async function detail(expenseId: string): Promise<ExpenseDetail> {
  const db = createAdminClient();
  const [payouts, payments, documents, accounts] = await Promise.all([
    db.from("expense_payouts").select("id, credit, phone, status, last_error, actor_name, created_at").eq("expense_id", expenseId).neq("status", "paid").order("created_at", { ascending: false }),
    db.from("expense_payments").select("*").eq("expense_id", expenseId).order("paid_on").order("created_at"),
    db.from("expense_documents").select("*").eq("expense_id", expenseId).order("created_at"),
    db.from("money_accounts").select("id, name"),
  ]);
  for (const r of [payouts, payments, documents, accounts]) if (r.error) fail(r.error);
  const accountName = new Map((accounts.data ?? []).map((a) => [a.id as string, a.name as string]));
  const paths = (documents.data ?? []).map((d) => d.path as string);
  const links = paths.length ? await db.storage.from(EXPENSE_DOCUMENTS_BUCKET).createSignedUrls(paths, LINK_SECONDS) : { data: [] };
  const url = new Map((links.data ?? []).map((l) => [l.path, l.signedUrl]));
  return {
    payouts: (payouts.data ?? []).map((p) => ({
      id: p.id,
      amount: Number(p.credit),
      phone: p.phone,
      status: p.status,
      error: p.last_error,
      sentBy: p.actor_name,
      sentAt: p.created_at,
    })),
    payments: (payments.data ?? []).map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      paidOn: p.paid_on,
      accountName: accountName.get(p.money_account_id) ?? "",
      method: p.method,
      phone: p.phone,
      reference: p.reference,
      note: p.note,
      recordedBy: p.actor_name,
      recordedAt: p.created_at,
      voidedAt: p.voided_at,
      voidReason: p.void_reason,
      voidedBy: p.voided_by_name,
    })),
    documents: (documents.data ?? []).map((d) => ({ id: d.id, fileName: d.file_name, url: url.get(d.path) ?? null, recordedBy: d.actor_name, recordedAt: d.created_at })),
  };
}

export async function startDocumentUpload(expenseId: string, fileName: string): Promise<{ path: string; token: string }> {
  if (!fileName.trim()) throw new AppError("That file has no name.");
  const path = `${expenseId}/${randomUUID()}-${safeStorageSegment(fileName)}`;
  const { data, error } = await createAdminClient().storage.from(EXPENSE_DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`books: ${error?.message ?? "no upload session"}`);
  return { path: data.path, token: data.token };
}

/** Checks the file really arrived, and belongs to this expense, before recording it. */
export async function confirmDocument(expenseId: string, path: string, byName: string): Promise<void> {
  const slash = path.lastIndexOf("/");
  const dir = path.slice(0, slash);
  const base = path.slice(slash + 1);
  if (dir !== expenseId) throw new AppError("That file belongs to another expense.");
  const db = createAdminClient();
  const { data: found, error: listError } = await db.storage.from(EXPENSE_DOCUMENTS_BUCKET).list(dir, { search: base, limit: 5 });
  const file = found?.find((f) => f.name === base);
  if (listError || !file) throw new AppError("The file didn't finish uploading. Try again.");
  const { error } = await db.from("expense_documents").insert({
    expense_id: expenseId,
    path,
    file_name: base.replace(/^[0-9a-f-]{36}-/, ""),
    mime_type: file.metadata?.mimetype ?? null,
    size_bytes: file.metadata?.size ?? null,
    actor_name: byName,
  });
  if (error) fail(error);
}

/** One payment, for its printable receipt. Null when there's no such payment. */
export async function receipt(paymentId: string) {
  const db = createAdminClient();
  const { data: p, error } = await db.from("expense_payments").select("*").eq("id", paymentId).maybeSingle();
  if (error) fail(error);
  if (!p) return null;
  const [{ data: expense }, { data: account }, { data: company }] = await Promise.all([
    db.from("expense_lines").select("name, recipient, category_name, amount, paid, description").eq("id", p.expense_id).single(),
    db.from("money_accounts").select("name").eq("id", p.money_account_id).single(),
    db.from("invoice_settings").select("company_name").limit(1).maybeSingle(),
  ]);
  return {
    id: p.id as string,
    companyName: (company?.company_name as string | undefined) ?? "",
    amount: Number(p.amount),
    paidOn: p.paid_on as string,
    method: p.method as string,
    phone: p.phone as string | null,
    reference: p.reference as string | null,
    note: p.note as string | null,
    recordedBy: p.actor_name as string,
    recordedAt: p.created_at as string,
    voidedAt: p.voided_at as string | null,
    voidReason: p.void_reason as string | null,
    accountName: (account?.name as string | undefined) ?? "",
    expenseName: (expense?.name as string | undefined) ?? "",
    recipient: (expense?.recipient as string | null | undefined) ?? null,
    categoryName: (expense?.category_name as string | undefined) ?? "",
    expenseTotal: Number(expense?.amount ?? 0),
    expensePaid: Number(expense?.paid ?? 0),
  };
}
