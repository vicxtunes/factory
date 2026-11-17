import "server-only";

// Staff pay (owner, 2026-11-15). Every rule about the money lives in the
// database (20270114100000_staff_pay.sql): payslips, advances taken off, what
// sends by itself. A payslip's pay is an expense, so paying it is paying a
// bill (expenses-server, payouts-server).

import { randomUUID } from "crypto";

import { localDate } from "@repo/lib/accounting/core/period";
import { formatMoney } from "@repo/lib/currency/format";
import { AppError } from "@repo/lib/kernel/core";
import { createAdminClient } from "@repo/lib/supabase/admin";
import { resolveTenantScope } from "@repo/lib/tenancy/server/resolve";
import type { TenantScope } from "@repo/lib/tenancy/types";
import { localPhone } from "@repo/lib/wallet/policy";
import * as notifier from "@repo/lib/wallet/server/notifier";
import * as hivepay from "@repo/lib/wallet/server/providers/hivepay";

import { linesByIds, voidExpense } from "./expenses-server";
import { sendPayout } from "./payouts-server";
import type { StaffAdvanceInput, StaffPayPersonInput } from "./schema";
import { failBooks as fail } from "./server";
import type { StaffAdvance, StaffPayCandidate, StaffPayGiven, StaffPayMonth, StaffPayPerson, StaffPayRegular, StaffPaySettings, StaffPaySlip } from "./staff-pay";

type Actor = { id: string; name: string };

const AUTOMATIC: Actor = { id: "staff-pay", name: "Aming (automatic)" };
/** HivePay's limit on how often the account may ask is shared with live payment screens. */
const SEND_EVERY_MS = 2_000;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface PersonRow {
  id: string;
  name: string;
  worker_id: string | null;
  profile_id: string | null;
  designer_id: string | null;
  pay_every: StaffPayPerson["payEvery"];
  day_rate: boolean;
  rate: number | string;
  pay_day: number;
  next_pay_on: string;
  phone: string | null;
  sends_itself: boolean;
  stopped_at: string | null;
  advance_owed: number | string;
}

interface SlipRow {
  id: string;
  person_id: string;
  pay_on: string;
  rate: number | string;
  day_rate: boolean;
  days: number | string | null;
  basic: number | string | null;
  allowances: { name: string; amount: number | string; once: boolean; days?: number; each?: number | string }[];
  advance: number | string;
  net: number | string | null;
  expense_id: string | null;
  moved_from_bill: boolean;
  advance_by_name: string | null;
}

const num = (v: number | string | null) => (v === null ? null : Number(v));

interface RegularRow {
  id: string;
  person_id: string;
  kind: StaffPayRegular["kind"];
  name: string;
  amount: number | string;
  weekdays: number[] | null;
  how: StaffPayRegular["how"];
  starts_on: string;
}

/** Staff cost by month for the charts: the last 12 months. */
const MONTHS_SHOWN = 12;
/** Allowances and advances given on their day: those still open, and these last days. */
const GIVEN_DAYS = 60;

/** Everything Accounts → Staff pay shows. Payslips due are made first. */
export async function staffPayBoard(scope: TenantScope): Promise<{
  people: StaffPayPerson[];
  slips: StaffPaySlip[];
  advances: StaffAdvance[];
  candidates: StaffPayCandidate[];
  settings: StaffPaySettings;
  given: StaffPayGiven[];
  months: StaffPayMonth[];
}> {
  const today = localDate(new Date(), scope.timeZone);
  await makeSlips(today);
  const db = createAdminClient();
  const firstMonth = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  firstMonth.setUTCMonth(firstMonth.getUTCMonth() - (MONTHS_SHOWN - 1));
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - GIVEN_DAYS * 86_400_000).toISOString().slice(0, 10);
  const [people, regulars, extras, slips, advances, workers, profiles, designers, settings, given, months] = await Promise.all([
    db.from("staff_pay_people_lines").select("*").eq("tenant_id", scope.tenantId).order("name").returns<PersonRow[]>(),
    db.from("staff_pay_regulars").select("id, person_id, kind, name, amount, weekdays, how, starts_on").is("stopped_at", null).order("created_at").returns<RegularRow[]>(),
    db.from("staff_pay_extras").select("id, person_id, name, amount").is("slip_id", null).order("created_at").returns<{ id: string; person_id: string; name: string; amount: number | string }[]>(),
    db.from("staff_pay_slips").select("*").eq("tenant_id", scope.tenantId).order("pay_on", { ascending: false }).limit(1000).returns<SlipRow[]>(),
    db.from("staff_pay_advances").select("id, person_id, amount, given_on").order("given_on", { ascending: false }).limit(500).returns<{ id: string; person_id: string; amount: number | string; given_on: string }[]>(),
    db.from("workers").select("id, name, station, active").order("name").returns<{ id: string; name: string; station: string | null; active: boolean }[]>(),
    db.from("profiles").select("id, full_name, role, suspended_at").order("full_name").returns<{ id: string; full_name: string | null; role: string; suspended_at: string | null }[]>(),
    db.from("designers").select("id, name, active").order("name").returns<{ id: string; name: string; active: boolean }[]>(),
    db.from("staff_pay_settings").select("sends_on, send_at").eq("tenant_id", scope.tenantId).maybeSingle<{ sends_on: boolean; send_at: string }>(),
    db.from("staff_pay_given").select("id, person_id, kind, due_on, staff_pay_regulars(name)").gte("due_on", since).order("due_on", { ascending: false }).limit(2000).returns<{ id: string; person_id: string; kind: StaffPayGiven["kind"]; due_on: string; staff_pay_regulars: { name: string } | null }[]>(),
    db.rpc("staff_pay_month_totals", { p_from: firstMonth.toISOString().slice(0, 10) }),
  ]);
  for (const r of [people, regulars, extras, slips, advances, workers, profiles, designers, settings, given, months]) if (r.error) fail(r.error);

  const slipRows = slips.data ?? [];
  const givenRows = given.data ?? [];
  // A daily advance is in both lists; the one given on its day shows with what's given.
  const givenIds = new Set(givenRows.map((g) => g.id));
  const advanceRows = (advances.data ?? []).filter((a) => !givenIds.has(a.id));
  const lines = new Map(
    (await linesByIds([...slipRows.flatMap((s) => (s.expense_id ? [s.expense_id] : [])), ...advanceRows.map((a) => a.id), ...givenRows.map((g) => g.id)])).map((l) => [l.id, l]),
  );
  const roleName = (role: string) => (role === "boss" ? "Boss" : role.charAt(0).toUpperCase() + role.slice(1));
  const workerOf = new Map((workers.data ?? []).map((w) => [w.id, w]));
  const profileOf = new Map((profiles.data ?? []).map((p) => [p.id, p]));

  const personRows = people.data ?? [];
  const taken = new Set(personRows.filter((p) => !p.stopped_at).flatMap((p) => [p.worker_id, p.profile_id, p.designer_id]));
  const candidates: StaffPayCandidate[] = [
    ...(workers.data ?? []).filter((w) => w.active).map((w) => ({ kind: "worker" as const, id: w.id, name: w.name, detail: w.station ? `Worker · ${w.station}` : "Worker" })),
    ...(profiles.data ?? []).filter((p) => !p.suspended_at).map((p) => ({ kind: "profile" as const, id: p.id, name: p.full_name ?? "Staff", detail: roleName(p.role) })),
    ...(designers.data ?? []).filter((d) => d.active).map((d) => ({ kind: "designer" as const, id: d.id, name: d.name, detail: "Designer" })),
  ].filter((c) => !taken.has(c.id));

  return {
    people: personRows.map((p) => ({
      id: p.id,
      name: p.name,
      workerId: p.worker_id,
      profileId: p.profile_id,
      designerId: p.designer_id,
      roles: [
        p.worker_id ? (workerOf.get(p.worker_id)?.station ?? "Worker") : null,
        p.profile_id ? roleName(profileOf.get(p.profile_id)?.role ?? "staff") : null,
        p.designer_id ? "Designer" : null,
      ].filter((r): r is string => !!r),
      payEvery: p.pay_every,
      dayRate: p.day_rate,
      rate: Number(p.rate),
      payDay: p.pay_day,
      nextPayOn: p.next_pay_on,
      phone: p.phone,
      sendsItself: p.sends_itself,
      regulars: (regulars.data ?? [])
        .filter((r) => r.person_id === p.id)
        .map((r) => ({ id: r.id, kind: r.kind, name: r.name, amount: Number(r.amount), weekdays: r.weekdays, how: r.how, startsOn: r.starts_on })),
      extras: (extras.data ?? []).filter((x) => x.person_id === p.id).map((x) => ({ id: x.id, name: x.name, amount: Number(x.amount) })),
      advanceOwed: Number(p.advance_owed),
      stopped: !!p.stopped_at,
    })),
    slips: slipRows.map((s) => ({
      id: s.id,
      personId: s.person_id,
      payOn: s.pay_on,
      rate: Number(s.rate),
      dayRate: s.day_rate,
      days: num(s.days),
      basic: num(s.basic),
      allowances: s.allowances.map((a) => ({ name: a.name, amount: Number(a.amount), once: a.once, ...(a.days ? { days: Number(a.days), each: Number(a.each) } : {}) })),
      advance: Number(s.advance),
      net: num(s.net),
      expense: s.expense_id ? (lines.get(s.expense_id) ?? null) : null,
      movedFromBill: s.moved_from_bill,
      advanceByName: s.advance_by_name,
    })),
    advances: advanceRows.map((a) => ({ id: a.id, personId: a.person_id, amount: Number(a.amount), givenOn: a.given_on, expense: lines.get(a.id) ?? null })),
    candidates,
    settings: { sendsOn: settings.data?.sends_on ?? false, sendAt: (settings.data?.send_at ?? "10:00").slice(0, 5) },
    given: givenRows.map((g) => {
      const expense = lines.get(g.id) ?? null;
      return { id: g.id, personId: g.person_id, kind: g.kind, name: g.kind === "advance" ? "Advance" : (g.staff_pay_regulars?.name ?? "Allowance"), dueOn: g.due_on, amount: expense?.amount ?? 0, expense };
    }),
    months: ((months.data ?? []) as { month: string; person_id: string; basic: number | string; allowances: number | string; advances: number | string }[]).map((m) => ({ month: m.month.slice(0, 7), personId: m.person_id, basic: Number(m.basic), allowances: Number(m.allowances), advances: Number(m.advances) })),
  };
}

async function makeSlips(today: string): Promise<void> {
  const { error } = await createAdminClient().rpc("staff_pay_make_slips", { p_today: today });
  if (error) fail(error);
}

export async function savePerson(input: StaffPayPersonInput, actor: Actor): Promise<void> {
  const { error } = await createAdminClient().rpc("staff_pay_save", {
    p_id: input.id,
    p_name: input.name,
    p_worker: input.workerId,
    p_profile: input.profileId,
    p_designer: input.designerId,
    p_every: input.payEvery,
    p_day_rate: input.dayRate,
    p_rate: input.rate,
    p_pay_day: input.payDay,
    p_phone: input.phone ?? "",
    p_sends_itself: input.sendsItself,
    p_regulars: input.regulars,
    p_actor_name: actor.name,
  });
  if (error) fail(error);
}

/** No more payslips. Those already made stay, to pay. */
export async function stopPerson(id: string, actor: Actor): Promise<void> {
  const db = createAdminClient();
  const at = new Date().toISOString();
  const { error } = await db.from("staff_pay_people").update({ stopped_at: at, stopped_by_name: actor.name, sends_itself: false }).eq("id", id).is("stopped_at", null);
  if (error) fail(error);
  const { error: regulars } = await db.from("staff_pay_regulars").update({ stopped_at: at }).eq("person_id", id).is("stopped_at", null);
  if (regulars) fail(regulars);
}

/** An allowance or advance given on its day that won't be given: its expense is voided. */
export async function cancelGiven(id: string, actor: Actor): Promise<void> {
  const { data, error } = await createAdminClient().from("staff_pay_given").select("id").eq("id", id).maybeSingle();
  if (error) fail(error);
  if (!data) throw new AppError("That isn't there any more. Refresh the page.");
  await voidExpense(id, "Not given", actor.name);
}

export async function addExtra(input: { id: string; personId: string; name: string; amount: number }, actor: Actor): Promise<void> {
  const { error } = await createAdminClient().from("staff_pay_extras").upsert({ id: input.id, person_id: input.personId, name: input.name, amount: input.amount, actor_name: actor.name }, { onConflict: "id", ignoreDuplicates: true });
  if (error) fail(error);
}

/** Only before a payslip took it. */
export async function removeExtra(id: string): Promise<void> {
  const { error } = await createAdminClient().from("staff_pay_extras").delete().eq("id", id).is("slip_id", null);
  if (error) fail(error);
}

export async function setDays(slipId: string, days: number, actor: Actor): Promise<void> {
  const { error } = await createAdminClient().rpc("staff_pay_set_days", { p_slip: slipId, p_days: days, p_actor_name: actor.name });
  if (error) fail(error);
}

/** What comes off a payslip for advances, set by the boss; the rest comes off the next. */
export async function setSlipAdvance(slipId: string, advance: number, actor: Actor): Promise<void> {
  const { error } = await createAdminClient().rpc("staff_pay_slip_advance", { p_slip: slipId, p_advance: advance, p_by_hand: true, p_actor_name: actor.name });
  if (error) fail(error);
}

/** An advance recorded for the wrong person: to the right one, or to no one on Staff pay (null). */
export async function moveAdvance(advanceId: string, personId: string | null, actor: Actor): Promise<void> {
  const { error } = await createAdminClient().rpc("staff_pay_advance_move", { p_advance: advanceId, p_person: personId, p_actor_name: actor.name });
  if (error) fail(error);
}

export async function setSettings(settings: StaffPaySettings, actor: Actor): Promise<void> {
  const { error } = await createAdminClient()
    .from("staff_pay_settings")
    .update({ sends_on: settings.sendsOn, send_at: settings.sendAt, updated_by_name: actor.name, updated_at: new Date().toISOString() })
    .eq("tenant_id", (await resolveTenantScope()).tenantId);
  if (error) fail(error);
}

/**
 * An advance: paid now from an account, or sent by HivePay (it counts once
 * HivePay delivers it). If HivePay turns it down, it's cancelled.
 */
export async function giveAdvance(input: StaffAdvanceInput, phone: string | null, actor: Actor): Promise<void> {
  const { error } = await createAdminClient().rpc("staff_pay_give_advance", {
    p_id: input.id,
    p_person: input.personId,
    p_amount: input.amount,
    p_given_on: input.givenOn,
    p_account: input.send ? null : input.accountId,
    p_method: input.method,
    p_reference: input.reference,
    p_actor_id: actor.id,
    p_actor_name: actor.name,
  });
  if (error) fail(error);
  if (!input.send || !phone) return;
  try {
    await sendPayout({ id: randomUUID(), expenseId: input.id, amount: input.amount, actual: null, phone }, phone, actor);
  } catch (err) {
    await voidExpense(input.id, "HivePay didn't send it.", actor.name).catch((e) => console.error("advance not voided:", input.id, e));
    throw err;
  }
}

/**
 * Makes the payslips due and sends those that go by themselves, each once.
 * No message when it goes (owner, 2026-11-15); the boss hears only when one
 * fails, and it waits in Staff pay. Called every few minutes.
 */
export async function runStaffPay(now = new Date()): Promise<void> {
  const scope = await resolveTenantScope();
  await makeSlips(localDate(now, scope.timeZone));
  if (!hivepay.isConfigured()) return;
  const { data, error } = await createAdminClient().rpc("staff_pay_autosend_claim", { p_now: now.toISOString() });
  if (error) fail(error);
  const due = (data ?? []) as { slip_id: string; expense_id: string; amount: number | string; phone: string; name: string }[];
  for (const [i, s] of due.entries()) {
    if (i > 0) await pause(SEND_EVERY_MS);
    const amount = Number(s.amount);
    try {
      await sendPayout({ id: randomUUID(), expenseId: s.expense_id, amount, actual: null, phone: s.phone }, s.phone, AUTOMATIC);
    } catch (err) {
      console.error("salary send failed:", s.slip_id, err);
      const why = err instanceof AppError ? err.message.replace(/^Not sent: /, "") : "it couldn't be sent";
      await notifier
        .salaryPayoutFailed("Salary not sent", `${s.name}'s pay, ${formatMoney(amount)} to ${localPhone(s.phone)}, didn't go (${why}). It waits in Staff pay for you.`)
        .catch((e) => console.error("salary failed push:", s.slip_id, e));
    }
  }

  const { data: givenData, error: givenError } = await createAdminClient().rpc("staff_pay_given_claim", { p_now: now.toISOString() });
  if (givenError) fail(givenError);
  const given = (givenData ?? []) as { given_id: string; expense_id: string; amount: number | string; phone: string; name: string; what: string }[];
  for (const [i, g] of given.entries()) {
    if (i > 0 || due.length > 0) await pause(SEND_EVERY_MS);
    const amount = Number(g.amount);
    try {
      await sendPayout({ id: randomUUID(), expenseId: g.expense_id, amount, actual: null, phone: g.phone }, g.phone, AUTOMATIC);
    } catch (err) {
      console.error("staff given send failed:", g.given_id, err);
      const why = err instanceof AppError ? err.message.replace(/^Not sent: /, "") : "it couldn't be sent";
      await notifier
        .salaryPayoutFailed(
          g.what === "advance" ? "Advance not sent" : "Allowance not sent",
          `${g.name}'s ${g.what}, ${formatMoney(amount)} to ${localPhone(g.phone)}, didn't go (${why}). It waits in Staff pay for you.`,
        )
        .catch((e) => console.error("staff given failed push:", g.given_id, e));
    }
  }
}
