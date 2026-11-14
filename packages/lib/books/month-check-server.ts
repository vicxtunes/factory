import "server-only";

// The month-end check's reads and writes (see supabase/migrations/20270113100000_petty_cash_month_check.sql).

import { localDate } from "@repo/lib/accounting/core/period";
import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { addMonths, isMonthOpen, type MonthCheck, type MonthCheckBooking, type MonthCheckLine, type MonthCheckStatus, type MonthCheckSummary } from "./month-check";
import { failBooks as fail } from "./server";

interface CheckRow {
  id: string;
  month: string;
  status: Exclude<MonthCheckStatus, "not_started">;
  submitted_by_name: string | null;
  submitted_at: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
}

interface LineRow {
  money_account_id: string;
  opening: number | string;
  money_in: number | string;
  money_out: number | string;
  day_counts: number | string;
  books: number | string;
  actual: number | string | null;
  reason: string | null;
  entered_by_name: string | null;
  booked_as: MonthCheckBooking | null;
}

type FigureRow = Pick<LineRow, "money_account_id" | "opening" | "money_in" | "money_out" | "day_counts" | "books">;

const localHour = (now: Date, timeZone: string) => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));

/** Every month from the first opening balance to this one, newest first, with how far each check got. */
export async function monthCheckList(scope: TenantScope, now = new Date()): Promise<MonthCheckSummary[]> {
  const db = createAdminClient();
  const [{ data: first, error }, { data: checks, error: checksError }] = await Promise.all([
    db.from("money_opening_balances").select("opening_on").eq("tenant_id", scope.tenantId).order("opening_on").limit(1).maybeSingle<{ opening_on: string }>(),
    db.from("month_checks").select("month, status").eq("tenant_id", scope.tenantId).returns<{ month: string; status: CheckRow["status"] }[]>(),
  ]);
  if (error) fail(error);
  if (checksError) fail(checksError);
  const today = localDate(now, scope.timeZone);
  const hour = localHour(now, scope.timeZone);
  const thisMonth = `${today.slice(0, 8)}01`;
  const firstMonth = first ? `${first.opening_on.slice(0, 8)}01` : thisMonth;
  const status = new Map((checks ?? []).map((c) => [c.month, c.status]));
  const months: MonthCheckSummary[] = [];
  for (let m = thisMonth; m >= firstMonth; m = addMonths(m, -1)) {
    months.push({ month: m, status: status.get(m) ?? "not_started", open: isMonthOpen(m, today, hour) });
  }
  return months;
}

/**
 * One month's check. Until the boss approves, the books are worked out afresh
 * (money can still arrive by itself); approved, it's what was approved.
 */
export async function monthCheck(scope: TenantScope, month: string, now = new Date()): Promise<MonthCheck> {
  const db = createAdminClient();
  const [{ data: check, error }, { data: accounts, error: accountsError }] = await Promise.all([
    db.from("month_checks").select("id, month, status, submitted_by_name, submitted_at, approved_by_name, approved_at").eq("tenant_id", scope.tenantId).eq("month", month).maybeSingle<CheckRow>(),
    db.from("money_accounts").select("id, name, kind").eq("tenant_id", scope.tenantId).returns<{ id: string; name: string; kind: string }[]>(),
  ]);
  if (error) fail(error);
  if (accountsError) fail(accountsError);
  const stored = new Map<string, LineRow>();
  if (check) {
    const { data, error: linesError } = await db.from("month_check_lines").select("*").eq("check_id", check.id).returns<LineRow[]>();
    if (linesError) fail(linesError);
    for (const l of data ?? []) stored.set(l.money_account_id, l);
  }
  let figures: FigureRow[];
  if (check?.status === "approved") {
    figures = [...stored.values()];
  } else {
    const { data, error: figuresError } = await db.rpc("month_check_figures", { p_month: month });
    if (figuresError) fail(figuresError);
    figures = (data ?? []) as FigureRow[];
  }
  const today = localDate(now, scope.timeZone);
  const order = ["cash", "petty_cash", "bank", "mobile_money", "hivepay"];
  const byId = new Map((accounts ?? []).map((a) => [a.id, a]));
  const lines: MonthCheckLine[] = figures
    .map((f) => {
      const s = stored.get(f.money_account_id);
      return {
        accountId: f.money_account_id,
        accountName: byId.get(f.money_account_id)?.name ?? "Account",
        opening: Number(f.opening),
        moneyIn: Number(f.money_in),
        moneyOut: Number(f.money_out),
        dayCounts: Number(f.day_counts),
        books: Number(f.books),
        actual: s?.actual == null ? null : Number(s.actual),
        reason: s?.reason ?? null,
        enteredBy: s?.entered_by_name ?? null,
        bookedAs: s?.booked_as ?? null,
      };
    })
    .sort((a, b) => {
      const ka = order.indexOf(byId.get(a.accountId)?.kind ?? "");
      const kb = order.indexOf(byId.get(b.accountId)?.kind ?? "");
      return ka - kb || a.accountName.localeCompare(b.accountName);
    });
  return {
    month,
    status: check?.status ?? "not_started",
    open: isMonthOpen(month, today, localHour(now, scope.timeZone)),
    submittedBy: check?.submitted_by_name ?? null,
    submittedAt: check?.submitted_at ?? null,
    approvedBy: check?.approved_by_name ?? null,
    approvedAt: check?.approved_at ?? null,
    lines,
  };
}

export async function saveMonthCheck(month: string, lines: { accountId: string; actual: number | null; reason: string | null }[], byName: string): Promise<void> {
  const { error } = await createAdminClient().rpc("month_check_save", {
    p_month: month,
    p_lines: lines.map((l) => ({ account: l.accountId, actual: l.actual, reason: l.reason })),
    p_actor_name: byName,
  });
  if (error) fail(error);
}

export async function submitMonthCheck(month: string, byName: string): Promise<void> {
  const { error } = await createAdminClient().rpc("month_check_submit", { p_month: month, p_actor_name: byName });
  if (error) fail(error);
}

export async function approveMonthCheck(month: string, bookings: { accountId: string; as: MonthCheckBooking }[], byName: string): Promise<void> {
  const { error } = await createAdminClient().rpc("month_check_approve", {
    p_month: month,
    p_bookings: bookings.map((b) => ({ account: b.accountId, as: b.as })),
    p_actor_name: byName,
  });
  if (error) fail(error);
}

/** Claims the day's month-end reminder: true only the first time. */
export async function claimMonthCheckReminder(day: string): Promise<boolean> {
  const { error } = await createAdminClient().from("month_check_reminders").insert({ day });
  if (!error) return true;
  if (error.code === "23505") return false;
  fail(error);
}

export async function monthCheckStatus(scope: TenantScope, month: string): Promise<MonthCheckStatus> {
  const { data, error } = await createAdminClient().from("month_checks").select("status").eq("tenant_id", scope.tenantId).eq("month", month).maybeSingle<{ status: CheckRow["status"] }>();
  if (error) fail(error);
  return data?.status ?? "not_started";
}
