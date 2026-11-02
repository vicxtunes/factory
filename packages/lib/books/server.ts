import "server-only";

// The only file in packages/lib/books that touches the database.

import { localDate } from "@repo/lib/accounting/core/period";
import { AppError } from "@repo/lib/kernel/core";
import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { DAY_CLOSED_MESSAGE, type DayAccount, type DayBook, type DayLineKind, type OtherMoneyLine, type OtherMoneyLineKind } from "./model";
import type { CloseDayInput, OtherMoneyInput } from "./schema";

const REFUSALS: Record<string, string> = {
  day_closed: DAY_CLOSED_MESSAGE,
  bad_amount: "Enter an amount of zero or more.",
  bad_account: "That account doesn't exist.",
  opening_set: "That account's opening balance was already set. If it was wrong, the difference shows at the next close.",
  future_day: "That day hasn't happened yet.",
  already_closed: "This day or a later one is already closed, so it can't be closed now.",
  opening_missing: "Set the opening balance of every account before closing a day.",
  count_cash: "Enter the cash you counted.",
  note_needed: "Say why the count is different from what's expected.",
};

/** A sentence for one of the database's refusals; anything else stays a plain error, logged and hidden. */
function fail(error: { message: string }): never {
  const code = /DAYBOOK:(\w+)/.exec(error.message)?.[1];
  if (code && REFUSALS[code]) throw new AppError(REFUSALS[code]);
  throw new Error(`books: ${error.message}`);
}

interface Row {
  id: string;
  kind: OtherMoneyLineKind;
  amount: number | string;
  sender_name: string;
  sender_phone: string | null;
  method: string;
  reference: string | null;
  received_on: string;
  account_name: string | null;
  note: string | null;
  recorded_by: string;
}

/** Money in that isn't from a client, between two local dates (inclusive; null: open-ended), newest first. */
export async function otherMoneyIn(scope: TenantScope, dates: { from: string | null; to: string | null }): Promise<OtherMoneyLine[]> {
  let q = createAdminClient().from("accounting_other_money_in").select("*").eq("tenant_id", scope.tenantId);
  if (dates.from) q = q.gte("received_on", dates.from);
  if (dates.to) q = q.lte("received_on", dates.to);
  const { data, error } = await q.order("received_on", { ascending: false }).order("recorded_at", { ascending: false }).returns<Row[]>();
  if (error) throw new Error(`books: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    amount: Number(r.amount),
    senderName: r.sender_name,
    senderPhone: r.sender_phone,
    method: r.method,
    reference: r.reference,
    receivedOn: r.received_on,
    accountName: r.account_name,
    note: r.note,
    recordedBy: r.recorded_by,
  }));
}

export async function recordOtherMoney(scope: TenantScope, input: OtherMoneyInput, actor: { id: string; name: string }): Promise<void> {
  const { error } = await createAdminClient().from("other_money_in").insert({
    tenant_id: scope.tenantId,
    kind: input.kind,
    amount: input.amount,
    sender_name: input.senderName,
    sender_phone: input.senderPhone,
    method: input.method,
    reference: input.reference,
    received_on: input.receivedOn,
    money_account_id: input.accountId,
    note: input.note,
    actor_id: actor.id,
    actor_name: actor.name,
  });
  if (error) fail(error);
}

export async function voidOtherMoney(scope: TenantScope, id: string, reason: string, byName: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("other_money_in")
    .update({ voided_at: new Date().toISOString(), void_reason: reason, voided_by_name: byName })
    .eq("tenant_id", scope.tenantId)
    .eq("id", id);
  if (error) fail(error);
}

// --- The day book ------------------------------------------------------------

interface BalanceRow {
  money_account_id: string;
  name: string;
  kind: DayAccount["kind"];
  opening: number | string | null;
  money_in: number | string;
  money_out: number | string;
  expected: number | string | null;
  counted: number | string | null;
  difference: number | string | null;
  closing: number | string | null;
  closed_at: string | null;
  closed_by: string | null;
  close_note: string | null;
}

interface LineRow {
  id: string;
  direction: "in" | "out";
  kind: DayLineKind;
  at: string;
  amount: number | string;
  money_account_id: string | null;
  method: string;
  party: string;
  sender_name: string | null;
  phone: string | null;
  reference: string | null;
  detail: string | null;
  recorded_by: string | null;
  recorded_at: string;
}

const numberOrNull = (v: number | string | null) => (v === null ? null : Number(v));

/** Everything Accounts → Today shows for one day. */
export async function dayBook(scope: TenantScope, day: string): Promise<DayBook> {
  const db = createAdminClient();
  const [balances, lines, last] = await Promise.all([
    db.rpc("money_day_balances", { p_day: day }),
    db.from("money_day_lines").select("*").eq("tenant_id", scope.tenantId).eq("day", day).order("at").returns<LineRow[]>(),
    db.from("day_closes").select("day").eq("tenant_id", scope.tenantId).order("day", { ascending: false }).limit(1).maybeSingle<{ day: string }>(),
  ]);
  if (balances.error) fail(balances.error);
  if (lines.error) fail(lines.error);
  if (last.error) fail(last.error);

  const rows = (balances.data ?? []) as BalanceRow[];
  const closed = rows.find((r) => r.closed_at);
  return {
    day,
    today: localDate(new Date(), scope.timeZone),
    lastClosedDay: last.data?.day ?? null,
    close: closed ? { closedAt: closed.closed_at!, closedBy: closed.closed_by ?? "", note: closed.close_note } : null,
    accounts: rows.map((r) => ({
      id: r.money_account_id,
      name: r.name,
      kind: r.kind,
      opening: numberOrNull(r.opening),
      moneyIn: Number(r.money_in),
      moneyOut: Number(r.money_out),
      expected: numberOrNull(r.expected),
      counted: numberOrNull(r.counted),
      difference: numberOrNull(r.difference),
      closing: numberOrNull(r.closing),
    })),
    lines: (lines.data ?? []).map((l) => ({
      id: l.id,
      direction: l.direction,
      kind: l.kind,
      at: l.at,
      amount: Number(l.amount),
      accountId: l.money_account_id,
      method: l.method,
      party: l.party,
      senderName: l.sender_name,
      phone: l.phone,
      reference: l.reference,
      detail: l.detail,
      recordedBy: l.recorded_by,
      recordedAt: l.recorded_at,
      late: closed ? new Date(l.recorded_at) > new Date(closed.closed_at!) : false,
    })),
  };
}

export async function setOpenings(counts: { accountId: string; amount: number }[], actor: { id: string; name: string }): Promise<void> {
  const db = createAdminClient();
  for (const c of counts) {
    const { error } = await db.rpc("money_set_opening", { p_account: c.accountId, p_amount: c.amount, p_actor_id: actor.id, p_actor_name: actor.name });
    if (error) fail(error);
  }
}

export async function closeDay(input: CloseDayInput, actor: { id: string; name: string }): Promise<void> {
  const { error } = await createAdminClient().rpc("money_close_day", {
    p_day: input.day,
    p_counts: input.counts.map((c) => ({ account: c.accountId, counted: c.counted })),
    p_note: input.note,
    p_actor_id: actor.id,
    p_actor_name: actor.name,
  });
  if (error) fail(error);
}
