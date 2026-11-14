"use client";

// Accounts → Month end (owner, 2026-11-14): what each account really holds at
// the end of a month against what the books say. The boss or anyone with
// Accounts → manage enters the real balances and why any differ, and sends it
// to the boss; the boss approves, saying what each difference was, and it's
// booked on the month's last day. A table on a desktop, a card per account on a
// phone; forms open in a FormSheet.

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { Card, FigureTile, formatDayTime } from "@repo/ui/accounting/shared";
import { ErrorLine, Form, parseNumber, useMoney, useSubmit } from "@repo/ui/production/sheets";
import { approveMonthCheck, saveMonthCheck, submitMonthCheck } from "@repo/lib/books/actions";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import {
  BOOKING_LABELS,
  MONTH_CHECK_STATUS_LABELS,
  bookingsFor,
  difference,
  monthEnd,
  monthName,
  monthTotals,
  notReady,
  type MonthCheck,
  type MonthCheckBooking,
  type MonthCheckLine,
  type MonthCheckSummary,
} from "@repo/lib/books/month-check";
import { downloadMonthCheckPdf } from "@repo/lib/books/month-check-pdf";

const STATUS_STYLES: Record<MonthCheck["status"], string> = {
  not_started: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300",
  draft: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  waiting: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400",
  approved: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
};

function DiffText({ line }: { line: MonthCheckLine }) {
  const money = useMoney();
  const diff = difference(line);
  if (diff === null) return <span className="text-muted">Not entered</span>;
  if (diff === 0) return <span className="font-medium text-success-700 dark:text-success-500">Matches</span>;
  return (
    <span className="font-semibold text-error-600 dark:text-error-400 tnum">
      {diff > 0 ? "+" : "−"}
      {money(Math.abs(diff))}
    </span>
  );
}

export function MonthCheckBoard({
  check,
  months,
  canManage,
  isBoss,
  timeZone,
}: {
  check: MonthCheck;
  months: MonthCheckSummary[];
  /** Accounts at manage: enter balances and send. */
  canManage: boolean;
  isBoss: boolean;
  timeZone: string;
}) {
  const money = useMoney();
  const currency = useCurrencySymbol();
  const router = useRouter();
  const pathname = usePathname();
  const [entering, setEntering] = useState(false);
  const [approving, setApproving] = useState(false);
  const totals = monthTotals(check.lines);
  const showCounts = check.lines.some((l) => l.dayCounts !== 0);
  const blocked = notReady(check.lines);
  const send = useSubmit(() => {});
  const editable = check.open && check.status !== "approved" && canManage;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Month">
          <Select value={check.month} onChange={(e) => router.push(`${pathname}?month=${e.target.value}`)} className="min-w-56">
            {months.map((m) => (
              <option key={m.month} value={m.month}>
                {monthName(m.month)}: {m.open ? MONTH_CHECK_STATUS_LABELS[m.status] : "not open yet"}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <Button variant={check.status === "not_started" || check.status === "draft" ? "primary" : "secondary"} onClick={() => setEntering(true)}>
              {check.lines.some((l) => l.actual !== null) ? "Edit balances" : "Enter balances"}
            </Button>
          ) : null}
          {editable && check.status !== "waiting" && check.lines.some((l) => l.actual !== null) ? (
            <Button
              variant="secondary"
              loading={send.pending}
              disabled={send.pending}
              onClick={() => (blocked ? send.setError(blocked) : send.submit(() => submitMonthCheck({ month: check.month })))}
            >
              Send to the boss
            </Button>
          ) : null}
          {isBoss && check.status === "waiting" ? <Button onClick={() => setApproving(true)}>Approve</Button> : null}
          {check.lines.length > 0 && check.open ? (
            <Button variant="secondary" onClick={() => downloadMonthCheckPdf(check, currency, (iso) => formatDayTime(iso, timeZone))}>
              Download PDF
            </Button>
          ) : null}
        </div>
      </div>
      <ErrorLine error={send.error} />

      {!check.open ? (
        <Card title={monthName(check.month)}>
          <p className="text-sm text-muted">
            The check opens at 8 pm on {new Date(`${monthEnd(check.month)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}, the month&apos;s last day. Count the cash and petty cash then, and take each account&apos;s balance from its statement or app.
          </p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[check.status]}`}>{MONTH_CHECK_STATUS_LABELS[check.status]}</span>
            <span className="text-muted">
              {check.status === "approved" && check.approvedBy && check.approvedAt
                ? `Approved by ${check.approvedBy}, ${formatDayTime(check.approvedAt, timeZone)}. Differences were booked on ${monthEnd(check.month)}.`
                : check.status === "waiting" && check.submittedBy && check.submittedAt
                  ? `Sent by ${check.submittedBy}, ${formatDayTime(check.submittedAt, timeZone)}.`
                  : "What each account really held at the end of the month's last day."}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FigureTile label="The books say" value={money(totals.books)} hint={`${check.lines.length} accounts`} />
            <FigureTile label="Really there" value={money(totals.actual)} hint={`${check.lines.filter((l) => l.actual !== null).length} of ${check.lines.length} entered`} />
            <FigureTile
              label="Difference"
              value={totals.difference === 0 ? money(0) : `${totals.difference > 0 ? "+" : "−"}${money(Math.abs(totals.difference))}`}
              tone={totals.difference !== 0 ? "warning" : undefined}
            />
            <FigureTile label="Accounts that differ" value={String(totals.differing)} tone={totals.differing > 0 ? "warning" : undefined} />
          </div>

          {/* Phone: a card per account. */}
          <ul className="space-y-3 lg:hidden">
            {check.lines.map((l) => (
              <li key={l.accountId} className={`rounded-2xl border bg-surface p-4 shadow-theme-xs ${difference(l) ? "border-error-500/40" : "border-border"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{l.accountName}</p>
                  <DiffText line={l} />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted">Opening</dt>
                  <dd className="text-right tnum">{money(l.opening)}</dd>
                  <dt className="text-muted">Money in</dt>
                  <dd className="text-right tnum">{money(l.moneyIn)}</dd>
                  <dt className="text-muted">Money out</dt>
                  <dd className="text-right tnum">{money(l.moneyOut)}</dd>
                  {l.dayCounts !== 0 ? (
                    <>
                      <dt className="text-muted">Day counts</dt>
                      <dd className="text-right tnum">{money(l.dayCounts)}</dd>
                    </>
                  ) : null}
                  <dt className="font-medium">Books say</dt>
                  <dd className="text-right font-medium tnum">{money(l.books)}</dd>
                  <dt className="font-medium">Really there</dt>
                  <dd className="text-right font-medium tnum">{l.actual === null ? "—" : money(l.actual)}</dd>
                </dl>
                {l.reason ? <p className="mt-2 text-xs text-muted">Why: {l.reason}</p> : null}
                {l.bookedAs ? <p className="mt-1 text-xs text-muted">Booked as: {BOOKING_LABELS[l.bookedAs]}</p> : null}
              </li>
            ))}
          </ul>

          {/* Desktop: one table. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-theme-xs lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 text-right font-medium">Opening</th>
                  <th className="px-4 py-2 text-right font-medium">Money in</th>
                  <th className="px-4 py-2 text-right font-medium">Money out</th>
                  {showCounts ? <th className="px-4 py-2 text-right font-medium">Day counts</th> : null}
                  <th className="px-4 py-2 text-right font-medium">Books say</th>
                  <th className="px-4 py-2 text-right font-medium">Really there</th>
                  <th className="px-4 py-2 text-right font-medium">Difference</th>
                  <th className="px-4 py-2 font-medium">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {check.lines.map((l) => (
                  <tr key={l.accountId} className={difference(l) ? "bg-error-50/40 dark:bg-error-500/5" : ""}>
                    <td className="px-4 py-2 font-medium">{l.accountName}</td>
                    <td className="px-4 py-2 text-right tnum">{money(l.opening)}</td>
                    <td className="px-4 py-2 text-right tnum">{money(l.moneyIn)}</td>
                    <td className="px-4 py-2 text-right tnum">{money(l.moneyOut)}</td>
                    {showCounts ? <td className="px-4 py-2 text-right tnum">{money(l.dayCounts)}</td> : null}
                    <td className="px-4 py-2 text-right font-medium tnum">{money(l.books)}</td>
                    <td className="px-4 py-2 text-right font-medium tnum">{l.actual === null ? "—" : money(l.actual)}</td>
                    <td className="px-4 py-2 text-right">
                      <DiffText line={l} />
                    </td>
                    <td className="max-w-72 px-4 py-2 text-xs text-muted">
                      {l.reason ?? ""}
                      {l.bookedAs ? <span className="block">Booked as: {BOOKING_LABELS[l.bookedAs]}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border font-semibold">
                <tr>
                  <td className="px-4 py-2">Total</td>
                  <td colSpan={showCounts ? 4 : 3} />
                  <td className="px-4 py-2 text-right tnum">{money(totals.books)}</td>
                  <td className="px-4 py-2 text-right tnum">{money(totals.actual)}</td>
                  <td className="px-4 py-2 text-right tnum">{totals.difference === 0 ? "" : `${totals.difference > 0 ? "+" : "−"}${money(Math.abs(totals.difference))}`}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted">
            Books say = opening + money in − money out{showCounts ? " + differences found when days were closed" : ""}, at the end of {monthEnd(check.month)}, as Accounts → Today works it out.
          </p>
        </>
      )}

      {entering ? <EnterSheet check={check} onClose={() => setEntering(false)} /> : null}
      {approving ? <ApproveSheet check={check} onClose={() => setApproving(false)} /> : null}
    </div>
  );
}

function EnterSheet({ check, onClose }: { check: MonthCheck; onClose: () => void }) {
  const money = useMoney();
  const [values, setValues] = useState(() => Object.fromEntries(check.lines.map((l) => [l.accountId, { actual: l.actual === null ? "" : String(l.actual), reason: l.reason ?? "" }])));
  const { error, pending, submit, setError } = useSubmit(onClose);
  const set = (id: string, patch: Partial<{ actual: string; reason: string }>) => setValues((v) => ({ ...v, [id]: { ...v[id]!, ...patch } }));

  return (
    <FormSheet open onClose={onClose} title={`Real balances, ${monthName(check.month)}`} size="lg">
      <Form
        onSubmit={() => {
          const lines = check.lines.map((l) => {
            const v = values[l.accountId]!;
            return { accountId: l.accountId, actual: v.actual.trim() === "" ? null : parseNumber(v.actual), reason: v.reason };
          });
          if (lines.some((l) => l.actual !== null && (!Number.isInteger(l.actual) || l.actual < 0))) return setError("Enter each balance in whole shillings.");
          submit(() => saveMonthCheck({ month: check.month, lines }));
        }}
      >
        <p className="text-xs text-muted">
          What each account held at the end of {monthEnd(check.month)}: count the cash and petty cash boxes, and take the bank, mobile money and HivePay balances from their statements or apps. Any that differ need a reason.
          {check.status === "waiting" ? " Saving sends it back: send it to the boss again after." : ""}
        </p>
        {check.lines.map((l) => {
          const v = values[l.accountId]!;
          const actual = v.actual.trim() === "" ? null : parseNumber(v.actual);
          const diff = actual === null || Number.isNaN(actual) ? null : actual - l.books;
          return (
            <div key={l.accountId} className="rounded-xl border border-border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{l.accountName}</p>
                <p className="text-xs text-muted">
                  Books say <span className="tnum">{money(l.books)}</span>
                </p>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Field label="Really there">
                  <TextInput inputMode="numeric" value={v.actual} onChange={(e) => set(l.accountId, { actual: e.target.value })} />
                </Field>
                {diff !== null && diff !== 0 ? (
                  <Field label={`Why ${diff < 0 ? "less" : "more"} (${diff < 0 ? "−" : "+"}${money(Math.abs(diff))})?`}>
                    <TextInput value={v.reason} onChange={(e) => set(l.accountId, { reason: e.target.value })} maxLength={500} />
                  </Field>
                ) : diff === 0 ? (
                  <p className="self-end pb-3 text-xs font-medium text-success-700 dark:text-success-500">Matches</p>
                ) : null}
              </div>
            </div>
          );
        })}
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          Save
        </Button>
      </Form>
    </FormSheet>
  );
}

function ApproveSheet({ check, onClose }: { check: MonthCheck; onClose: () => void }) {
  const money = useMoney();
  const differing = check.lines.filter((l) => (difference(l) ?? 0) !== 0);
  const [bookings, setBookings] = useState<Record<string, MonthCheckBooking | "">>(() => Object.fromEntries(differing.map((l) => [l.accountId, ""])));
  const { error, pending, submit, setError } = useSubmit(onClose);

  return (
    <FormSheet open onClose={onClose} title={`Approve ${monthName(check.month)}`}>
      <Form
        onSubmit={() => {
          if (differing.some((l) => !bookings[l.accountId])) return setError("Say what each difference was.");
          submit(() => approveMonthCheck({ month: check.month, bookings: differing.map((l) => ({ accountId: l.accountId, as: bookings[l.accountId] as MonthCheckBooking })) }));
        }}
      >
        {differing.length === 0 ? (
          <p className="text-sm">Every account matches the books. Approving closes the month&apos;s check.</p>
        ) : (
          <>
            <p className="text-xs text-muted">
              Each difference is booked on {monthEnd(check.month)}, so next month starts from what was really there. A shortage is an expense (Month-end shortages); a surplus is other income; a wrong starting balance is neither. After approving, the check can&apos;t change.
            </p>
            {differing.map((l) => {
              const diff = difference(l)!;
              return (
                <div key={l.accountId} className="rounded-xl border border-border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{l.accountName}</p>
                    <DiffText line={l} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Books {money(l.books)} · really {money(l.actual!)} · why: {l.reason}
                  </p>
                  <div className="mt-2">
                    <Field label="What was it?">
                      <Select value={bookings[l.accountId]} onChange={(e) => setBookings((b) => ({ ...b, [l.accountId]: e.target.value as MonthCheckBooking }))} required>
                        <option value="">Choose…</option>
                        {bookingsFor(diff).map((b) => (
                          <option key={b} value={b}>
                            {BOOKING_LABELS[b]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </div>
              );
            })}
          </>
        )}
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          Approve
        </Button>
      </Form>
    </FormSheet>
  );
}
