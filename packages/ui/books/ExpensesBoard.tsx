"use client";

// Accounts → Expenses: one-time and recurring, all in one list. Status comes
// from the payments. Forms sit in form sheets; the list is cards on a phone
// and a table from md, recurring expenses a grid of cards. Boss and
// supervisors record, pay and manage recurring ones; the boss approves what's
// above the limit.

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";

import { Button } from "@repo/ui/Button";
import { DataTable, type DataTableColumn } from "@repo/ui/DataTable";
import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { TableFilters } from "@repo/ui/TableFilters";
import { UploadRow } from "@repo/ui/UploadRow";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { Card, EmptyState, FigureTile, formatDayTime, useMoney } from "@repo/ui/accounting/shared";
import { compactNumber, monthLabel } from "@repo/ui/charts/format";
import { ChartCard, GroupedColumns, RankBars, SERIES } from "@repo/ui/charts/kit";
import { DAY_PERIOD_PRESETS, addDays, type Period } from "@repo/lib/accounting/core/period";
import { VoidSheet, parseNumber } from "@repo/ui/production/sheets";
import { localPhone } from "@repo/lib/wallet/policy";
import { todayHere, useMoneySource } from "@repo/ui/wallet/MoneySourceFields";
import {
  addExpenseCategory,
  addExpenseSchedule,
  decideExpense,
  editExpenseSchedule,
  getExpenseDetail,
  holdExpenseAutopay,
  payExpense,
  restoreExpense,
  resumeExpenseSchedule,
  sendExpensePayout,
  setExpenseSchedulePayPhone,
  recordExpense,
  setExpenseApprovalLimit,
  setExpenseAutopayLimit,
  setHivepaySendFees,
  stopExpenseSchedule,
  voidExpense,
  voidExpensePayment,
} from "@repo/lib/books/actions";
import { uploadExpenseDocument } from "@repo/lib/books/expense-documents";
import {
  EVERY_UNITS,
  EXPENSE_STATUS_LABELS,
  SCHEDULE_STATE_LABELS,
  WEEKDAYS,
  everyUnit,
  expenseBalance,
  expenseBelongsOn,
  expenseStatus,
  goesByItself,
  readyToSend,
  onOrAfterWeekday,
  repeatLabel,
  scheduleState,
  weekdayOf,
  type ExpenseCategory,
  type ExpenseDetail,
  type ExpenseEvery,
  type ExpenseLine,
  type ExpenseMonth,
  type ExpensePayment,
  type ExpenseSchedule,
  type ExpenseStatus,
  type ExpenseSummary,
  type ScheduleState,
  type UpcomingBill,
} from "@repo/lib/books/expenses";
import { matchesSearch } from "@repo/lib/search";
import type { PaymentMethod } from "@repo/lib/wallet/types";

/** Expenses at manage (staff access): without it the board only shows, with no record, pay, void or edit. */
const CanManage = createContext(true);

const METHODS: Record<string, string> = { cash: "Cash", mobile_money: "Mobile money", bank_transfer: "Bank transfer", other: "Other" };
const FILE_TYPES = "image/*,application/pdf";
/** How far ahead Coming up looks; the server projects recurring bills as far (UPCOMING_DAYS). */
const COMING_UP_DAYS = 30;

type Tab = "to_pay" | "overdue" | "waiting" | "coming_up" | "paid" | "recurring" | "voided" | "all";
/** These are as of today, whatever the period. */
const OWED_TABS: Tab[] = ["to_pay", "overdue", "waiting", "coming_up"];
type Sort = "newest" | "oldest" | "due" | "largest" | "smallest";

const SORTS: Record<Sort, string> = { newest: "Newest first", oldest: "Oldest first", due: "Due soonest", largest: "Largest first", smallest: "Smallest first" };

const STATUS_STYLES: Record<ExpenseStatus, string> = {
  voided: "bg-gray-100 text-gray-500 line-through dark:bg-white/5",
  rejected: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
  waiting: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  on_credit: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300",
  paid: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  overdue: "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400",
  part_paid: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  unpaid: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300",
};

const STATE_STYLES: Record<ScheduleState, string> = {
  running: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  paused: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  finished: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-white/5",
};

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));

function StatusBadge({ status }: { status: ExpenseStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>{EXPENSE_STATUS_LABELS[status]}</span>;
}

function StateBadge({ state }: { state: ScheduleState }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLES[state]}`}>{SCHEDULE_STATE_LABELS[state]}</span>;
}

const uniq = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));

/** A bill in Coming up: one already created, or one a recurring expense will create. */
type ComingBill = { kind: "bill"; line: ExpenseLine; dueOn: string } | { kind: "planned"; schedule: ExpenseSchedule; dueOn: string };

export function ExpensesBoard({
  today,
  lines,
  summary,
  months,
  period,
  categories,
  schedules,
  upcoming,
  approvalAbove,
  autopayUpTo,
  sendFees,
  isBoss,
  canManage,
  canSend,
  timeZone,
}: {
  today: string;
  lines: ExpenseLine[];
  summary: ExpenseSummary;
  months: ExpenseMonth[];
  period: Period;
  categories: ExpenseCategory[];
  schedules: ExpenseSchedule[];
  upcoming: UpcomingBill[];
  approvalAbove: number | null;
  /** Autopay bills go by themselves up to this much; null: no limit. */
  autopayUpTo: number | null;
  /** HivePay's sending fee bands (Aming sends the fee on top). */
  sendFees: { upTo: number; fee: number }[];
  /** May approve expenses (Approve & pay bills): what they record never waits. */
  isBoss: boolean;
  /** Expenses at manage: record, pay, void, edit. */
  canManage: boolean;
  /** Approve & pay bills, with HivePay set up on this server: bills can be paid by mobile money. */
  canSend: boolean;
  timeZone: string;
}) {
  const money = useMoney();
  const [tab, setTab] = useState<Tab>("to_pay");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recorder, setRecorder] = useState("");
  const [account, setAccount] = useState("");
  const [kind, setKind] = useState<"" | "one_time" | "recurring">("");
  const [sort, setSort] = useState<Sort>("newest");
  const [sheet, setSheet] = useState<"new" | "limit" | "autopay_limit" | "send_fees" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Opened from Ready to send: straight to sending it.
  const [openToSend, setOpenToSend] = useState(false);
  const [openSchedule, setOpenSchedule] = useState<string | null>(null);
  const opened = lines.find((l) => l.id === openId) ?? null;
  const scheduleOpened = schedules.find((s) => s.id === openSchedule) ?? null;

  const status = (e: ExpenseLine) => expenseStatus(e, today);
  const inPeriod = (e: ExpenseLine) => {
    const on = expenseBelongsOn(e);
    return (!period.fromDate || on >= period.fromDate) && (!period.toDate || on <= period.toDate);
  };
  const comingBy = addDays(today, COMING_UP_DAYS);
  const inTab: Record<Exclude<Tab, "recurring">, (e: ExpenseLine) => boolean> = {
    to_pay: (e) => ["unpaid", "part_paid", "overdue", "waiting"].includes(status(e)),
    overdue: (e) => status(e) === "overdue",
    waiting: (e) => status(e) === "waiting",
    coming_up: (e) => expenseBalance(e) > 0 && e.dueOn !== null && e.dueOn >= today && e.dueOn <= comingBy,
    paid: (e) => inPeriod(e) && (status(e) === "paid" || status(e) === "on_credit"),
    voided: (e) => inPeriod(e) && (status(e) === "voided" || status(e) === "rejected"),
    all: (e) => inPeriod(e),
  };
  const filtersOn = !!(search.trim() || category || recipient || recorder || account || kind);
  const passes = (e: ExpenseLine) =>
    (!category || e.category === category) &&
    (!recipient || e.recipient === recipient) &&
    (!recorder || e.recordedBy === recorder) &&
    (!account || e.paidFrom.includes(account)) &&
    (!kind || (kind === "recurring") === (e.scheduleId !== null)) &&
    matchesSearch(search, [e.name, e.recipient, e.categoryName, e.description, e.recordedBy, e.amount, ...e.paidFrom]);
  const count = (k: Exclude<Tab, "recurring">) => lines.filter((e) => inTab[k](e) && passes(e)).length;

  const shown = tab === "recurring" ? [] : lines.filter((e) => inTab[tab](e) && passes(e));
  const byDue = (a: ExpenseLine, b: ExpenseLine) => (a.dueOn ?? a.spentOn).localeCompare(b.dueOn ?? b.spentOn);
  const sorted = [...shown].sort((a, b) => {
    if (sort === "due") return byDue(a, b);
    if (sort === "largest") return b.amount - a.amount;
    if (sort === "smallest") return a.amount - b.amount;
    const on = expenseBelongsOn(a).localeCompare(expenseBelongsOn(b)) || a.recordedAt.localeCompare(b.recordedAt);
    return sort === "oldest" ? on : -on;
  });
  // What's still to pay: soonest first unless another order was chosen.
  const visible = OWED_TABS.includes(tab) && sort === "newest" ? [...shown].sort(byDue) : sorted;

  // Coming up: bills already created plus what recurring expenses will create.
  const running = new Map(schedules.map((s) => [s.id, s]));
  const coming: ComingBill[] = [
    ...lines.filter((e) => inTab.coming_up(e) && passes(e)).map((line): ComingBill => ({ kind: "bill", line, dueOn: line.dueOn ?? line.spentOn })),
    ...upcoming.flatMap((u): ComingBill[] => {
      const s = running.get(u.scheduleId);
      if (!s || (category && s.category !== category) || (recipient && s.recipient !== recipient) || (recorder && s.recordedBy !== recorder) || kind === "one_time" || account) return [];
      if (!matchesSearch(search, [s.name, s.recipient, s.categoryName, s.description, s.recordedBy, s.amount])) return [];
      return [{ kind: "planned", schedule: s, dueOn: u.dueOn }];
    }),
  ].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const comingTotal = coming.reduce((sum, c) => sum + (c.kind === "bill" ? expenseBalance(c.line) : c.schedule.amount), 0);

  const shownTotal = visible.reduce((sum, e) => sum + e.amount, 0);
  const shownLeft = visible.reduce((sum, e) => sum + expenseBalance(e), 0);

  const options = useMemo(
    () => ({
      recipients: uniq(lines.map((l) => l.recipient)),
      recorders: uniq(lines.map((l) => l.recordedBy)),
      accounts: uniq(lines.flatMap((l) => l.paidFrom)),
      categories: categories.filter((c) => lines.some((l) => l.category === c.key)),
    }),
    [lines, categories],
  );

  function clearFilters() {
    setSearch("");
    setCategory("");
    setRecipient("");
    setRecorder("");
    setAccount("");
    setKind("");
  }

  const columns: DataTableColumn<ExpenseLine>[] = [
    {
      key: "name",
      header: "Expense",
      render: (e) => (
        <span className="font-medium">
          {e.name}
          {e.scheduleId ? <span className="ml-1.5 text-xs font-normal text-muted">Recurring</span> : null}
        </span>
      ),
    },
    { key: "recipient", header: "To", render: (e) => e.recipient ?? "—" },
    { key: "category", header: "Category", render: (e) => e.categoryName },
    { key: "date", header: "Date", render: (e) => day(e.spentOn) },
    { key: "due", header: "Due", render: (e) => (e.dueOn ? day(e.dueOn) : "—") },
    { key: "amount", header: "Amount", align: "right", render: (e) => `${e.amountIsEstimate ? "About " : ""}${money(e.amount)}` },
    { key: "left", header: "Left to pay", align: "right", render: (e) => money(expenseBalance(e)) },
    { key: "status", header: "Status", render: (e) => <StatusBadge status={status(e)} /> },
  ];

  const live = schedules.filter((s) => !s.endedAt);
  const ready = canSend ? readyToSend(lines, today) : [];
  const open = (id: string, toSend = false) => {
    setOpenToSend(toSend);
    setOpenId(id);
  };

  return (
    <CanManage.Provider value={canManage}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {canManage ? <Button onClick={() => setSheet("new")}>Record expense</Button> : null}
        {isBoss ? (
          <Button variant="secondary" onClick={() => setSheet("limit")}>
            Approval limit: {approvalAbove === null ? "none" : money(approvalAbove)}
          </Button>
        ) : null}
        {canSend ? (
          <Button variant="secondary" onClick={() => setSheet("autopay_limit")}>
            Autopay sends by itself: {autopayUpTo === null ? "any amount" : `up to ${money(autopayUpTo)}`}
          </Button>
        ) : null}
        {canSend ? (
          <Button variant="secondary" onClick={() => setSheet("send_fees")}>
            HivePay fees: {sendFees.length ? `${sendFees.length} bands` : "not entered"}
          </Button>
        ) : null}
        {isBoss ? null : approvalAbove !== null ? (
          <p className="text-xs text-muted">The boss approves anything above {money(approvalAbove)}.</p>
        ) : null}
      </div>

      {ready.length ? (
        <Card title={`Ready to send (${ready.length})`}>
          <p className="mb-2 text-xs text-muted">
            Due bills with a number to pay to. Those you were told about go by themselves at their time; hold one to send it yourself. The rest go only when you approve and send them.
          </p>
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {ready.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 rounded-2xl border border-border p-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{e.name}</span>
                  <span className="block text-xs text-muted">
                    {e.dueOn ? `Due ${day(e.dueOn)}` : null} · {localPhone(e.payPhone!)}
                  </span>
                  <span className="block font-semibold tnum">
                    {e.amountIsEstimate ? "About " : ""}
                    {money(expenseBalance(e))}
                  </span>
                  <AutopayNote expense={e} today={today} timeZone={timeZone} />
                </span>
                <span className="flex gap-2">
                  {goesByItself(e) ? <HoldButton id={e.id} /> : null}
                  <Button className="flex-1" variant={goesByItself(e) ? "secondary" : undefined} onClick={() => open(e.id, true)}>
                    {goesByItself(e) ? "Send now" : "Approve and send"}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <FigureTile label="To pay" value={money(summary.toPay)} hint="Everything still owed, as of today" />
        <FigureTile
          label="Overdue"
          value={money(summary.overdue)}
          hint={`${summary.overdueCount} ${summary.overdueCount === 1 ? "bill" : "bills"} past the due date`}
          tone={summary.overdue > 0 ? "warning" : undefined}
        />
        <FigureTile label="Coming up" value={money(summary.upcoming)} hint={`${summary.upcomingCount} due in the next 14 days`} />
      </div>

      <PeriodPicker period={period} presets={DAY_PERIOD_PRESETS} />
      <div className="grid gap-3 sm:grid-cols-3">
        <FigureTile label="Expenses in this period" value={money(summary.total)} />
        <FigureTile label="Paid" value={money(summary.paid)} />
        <FigureTile label="Left to pay" value={money(summary.owing)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Expenses by category"
          subtitle="Largest first, for this period"
          empty={summary.byCategory.length ? null : "No expenses in this period."}
          table={{
            columns: [
              { key: "name", label: "Category" },
              { key: "total", label: "Expenses", align: "right" },
              { key: "paid", label: "Paid", align: "right" },
              { key: "owing", label: "Left to pay", align: "right" },
            ],
            rows: summary.byCategory.map((c) => ({ name: c.name, total: money(c.total), paid: money(c.paid), owing: money(c.owing) })),
          }}
        >
          {(w) => (
            <RankBars
              width={w}
              format={money}
              color={SERIES[1]}
              limit={summary.byCategory.length}
              rows={summary.byCategory.map((c) => ({ key: c.key, label: c.name, value: c.total, detail: `${money(c.owing)} left to pay` }))}
            />
          )}
        </ChartCard>
        <ChartCard
          title="Expenses by month"
          subtitle="The 12 months up to the end of this period"
          empty={months.some((m) => m.total > 0) ? null : "No expenses in these months."}
          table={{
            columns: [
              { key: "month", label: "Month" },
              { key: "total", label: "Expenses", align: "right" },
              { key: "paid", label: "Paid", align: "right" },
            ],
            rows: months.map((m) => ({ month: monthLabel(m.month.slice(0, 7), true), total: money(m.total), paid: money(m.paid) })),
          }}
        >
          {(w) => (
            <GroupedColumns
              width={w}
              data={months.map((m, i) => ({ key: m.month, label: monthLabel(m.month.slice(0, 7), i === 0), values: [m.total, m.paid] }))}
              series={[
                { label: "Expenses", color: SERIES[1] },
                { label: "Paid", color: SERIES[0] },
              ]}
              format={money}
              axisFormat={compactNumber}
              extra={(i) => [{ label: "Left to pay", value: money(Math.max(months[i].total - months[i].paid, 0)) }]}
            />
          )}
        </ChartCard>
      </div>

      <TableFilters
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search expense, who it's for, amount…"
        searchLabel="Search expenses"
        value={tab}
        onChange={(k: Tab) => setTab(k)}
        tabs={[
          { key: "to_pay", label: "To pay", count: count("to_pay") },
          { key: "overdue", label: "Overdue", count: count("overdue"), tone: "warning" },
          { key: "waiting", label: "Waiting for approval", count: count("waiting"), tone: "warning" },
          { key: "coming_up", label: `Next ${COMING_UP_DAYS} days`, count: coming.length },
          { key: "paid", label: "Paid", count: count("paid") },
          { key: "recurring", label: "Recurring", count: live.length },
          { key: "voided", label: "Voided or rejected", count: count("voided") },
          { key: "all", label: "All", count: count("all") },
        ]}
        exportFilename="expenses"
        exportRows={visible.map((e) => ({
          date: e.spentOn,
          due: e.dueOn ?? "",
          name: e.name,
          to: e.recipient ?? "",
          category: e.categoryName,
          amount: e.amount,
          paid: e.paid,
          left: expenseBalance(e),
          status: EXPENSE_STATUS_LABELS[status(e)],
          paidFrom: e.paidFrom.join(", "),
          recurring: e.scheduleEvery ? repeatLabel(e.scheduleEvery, e.scheduleEveryCount ?? 1, e.dueOn) : "",
          recordedBy: e.recordedBy,
        }))}
        exportColumns={[
          { key: "date", label: "Date" },
          { key: "due", label: "Due" },
          { key: "name", label: "Expense" },
          { key: "to", label: "To" },
          { key: "category", label: "Category" },
          { key: "amount", label: "Amount" },
          { key: "paid", label: "Paid" },
          { key: "left", label: "Left to pay" },
          { key: "status", label: "Status" },
          { key: "paidFrom", label: "Paid from" },
          { key: "recurring", label: "Repeats" },
          { key: "recordedBy", label: "Recorded by" },
        ]}
      />

      {tab === "recurring" ? null : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {options.categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Who it's for" value={recipient} onChange={(e) => setRecipient(e.target.value)}>
            <option value="">Anyone it&apos;s for</option>
            {options.recipients.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Select aria-label="Recorded by" value={recorder} onChange={(e) => setRecorder(e.target.value)}>
            <option value="">Recorded by anyone</option>
            {options.recorders.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Select aria-label="Paid from" value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Paid from any account</option>
            {options.accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Select aria-label="One-time or recurring" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="">One-time and recurring</option>
            <option value="one_time">One-time only</option>
            <option value="recurring">Recurring only</option>
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {(Object.keys(SORTS) as Sort[]).map((k) => (
              <option key={k} value={k}>
                {SORTS[k]}
              </option>
            ))}
          </Select>
        </div>
      )}

      {tab === "recurring" ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-muted">
            {tab === "coming_up" ? (
              <>
                <span className="font-semibold text-foreground tnum">{coming.length}</span> {coming.length === 1 ? "bill" : "bills"} due by {day(comingBy)} ·{" "}
                <span className="font-semibold text-foreground tnum">{money(comingTotal)}</span> to pay
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground tnum">{visible.length}</span> {visible.length === 1 ? "expense" : "expenses"} ·{" "}
                <span className="font-semibold text-foreground tnum">{money(shownTotal)}</span>
                {shownLeft > 0 ? (
                  <>
                    {" "}
                    · <span className="font-semibold text-foreground tnum">{money(shownLeft)}</span> left to pay
                  </>
                ) : null}
                {OWED_TABS.includes(tab) ? " · everything still owed, whatever the period" : ` · ${period.fromDate ? `${day(period.fromDate)} to ${day(period.toDate ?? today)}` : "all time"}`}
              </>
            )}
          </p>
          {filtersOn ? (
            <button type="button" className="text-xs font-medium text-brand-600 underline" onClick={clearFilters}>
              Clear search and filters
            </button>
          ) : null}
        </div>
      )}

      {tab === "recurring" ? (
        <SchedulesList schedules={schedules} lines={lines} today={today} categories={categories} canSend={canSend} onOpenLine={open} />
      ) : tab === "coming_up" ? (
        coming.length === 0 ? (
          <EmptyState>{filtersOn ? "Nothing coming up matches the search and filters." : `Nothing due in the next ${COMING_UP_DAYS} days.`}</EmptyState>
        ) : (
          <ComingUpList bills={coming} today={today} onOpenLine={open} onOpenSchedule={setOpenSchedule} />
        )
      ) : visible.length === 0 ? (
        <EmptyState>{filtersOn ? "Nothing matches the search and filters." : "Nothing here."}</EmptyState>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {visible.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => open(e.id)} className="w-full rounded-2xl border border-border bg-surface p-3 text-left shadow-theme-xs">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{e.name}</span>
                    <span className="shrink-0 font-semibold tnum">{money(e.amount)}</span>
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {[e.recipient, e.categoryName, e.dueOn ? `Due ${day(e.dueOn)}` : day(e.spentOn), e.scheduleId ? "Recurring" : null].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-2">
                    <StatusBadge status={status(e)} />
                    {expenseBalance(e) > 0 && e.paid > 0 ? <span className="text-xs text-muted tnum">{money(expenseBalance(e))} left</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <DataTable className="hidden md:block" columns={columns} rows={visible} rowKey={(e) => e.id} onRowClick={(e) => open(e.id)} />
        </>
      )}

      {sheet === "new" ? <NewExpenseSheet categories={categories} today={today} canSend={canSend} onClose={() => setSheet(null)} /> : null}
      {sheet === "limit" ? <LimitSheet above={approvalAbove} onClose={() => setSheet(null)} /> : null}
      {sheet === "autopay_limit" ? <AutopayLimitSheet upTo={autopayUpTo} onClose={() => setSheet(null)} /> : null}
      {sheet === "send_fees" ? <SendFeesSheet bands={sendFees} onClose={() => setSheet(null)} /> : null}
      {opened ? <ExpenseSheet key={opened.id} expense={opened} today={today} isBoss={isBoss} canSend={canSend} startSending={openToSend} timeZone={timeZone} onClose={() => setOpenId(null)} /> : null}
      {scheduleOpened ? (
        <ScheduleSheet
          key={scheduleOpened.id}
          schedule={scheduleOpened}
          lines={lines}
          today={today}
          categories={categories}
          canSend={canSend}
          onOpenLine={(id) => {
            setOpenSchedule(null);
            open(id);
          }}
          onClose={() => setOpenSchedule(null)}
        />
      ) : null}
    </div>
    </CanManage.Provider>
  );
}

/** Coming up, soonest first: created bills open themselves, planned ones their recurring expense. */
function ComingUpList({ bills, today, onOpenLine, onOpenSchedule }: { bills: ComingBill[]; today: string; onOpenLine: (id: string) => void; onOpenSchedule: (id: string) => void }) {
  const money = useMoney();
  return (
    <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {bills.map((b) => {
        const name = b.kind === "bill" ? b.line.name : b.schedule.name;
        const who = b.kind === "bill" ? b.line.recipient : b.schedule.recipient;
        const amount = b.kind === "bill" ? expenseBalance(b.line) : b.schedule.amount;
        const estimate = b.kind === "bill" ? b.line.amountIsEstimate : b.schedule.varies;
        return (
          <li key={b.kind === "bill" ? b.line.id : `${b.schedule.id}-${b.dueOn}`}>
            <button
              type="button"
              onClick={() => (b.kind === "bill" ? onOpenLine(b.line.id) : onOpenSchedule(b.schedule.id))}
              className="flex w-full items-start gap-3 rounded-2xl border border-border bg-surface p-3 text-left shadow-theme-xs"
            >
              <span className="w-12 shrink-0 rounded-xl bg-gray-100 py-1 text-center dark:bg-white/5">
                <span className="block text-lg font-bold leading-tight tnum">{Number(b.dueOn.slice(8, 10))}</span>
                <span className="block text-[11px] uppercase text-muted">{day(b.dueOn).split(" ")[1]}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{name}</span>
                  <span className="shrink-0 font-semibold tnum">
                    {estimate ? "About " : ""}
                    {money(amount)}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {[who, b.dueOn === today ? "Due today" : `Due ${day(b.dueOn)}`, b.kind === "planned" ? "Not created yet" : b.line.paid > 0 ? "Part paid" : null].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="text-xs text-error-600">{error}</p> : null;
}

/** How often, from when, and until when: the same fields to add and to edit a recurring expense. */
interface RepeatValue {
  every: ExpenseEvery;
  everyCount: string;
  /** The first due date (new) or the next one (edit). */
  dueOn: string;
  end: "never" | "on" | "after";
  endsOn: string;
  times: string;
}

function repeatInput(r: RepeatValue): { error: string } | { every: ExpenseEvery; everyCount: number; endsOn: string | null; times: number | null } {
  const everyCount = parseNumber(r.everyCount);
  if (!Number.isInteger(everyCount) || everyCount < 1 || everyCount > 366) return { error: "Say how many days, weeks, months or years between bills (1 to 366)." };
  if (!r.dueOn) return { error: "Enter the due date." };
  if (r.end === "on" && (!r.endsOn || r.endsOn < r.dueOn)) return { error: "The end date must be on or after the due date." };
  const times = parseNumber(r.times);
  if (r.end === "after" && (!Number.isInteger(times) || times < 1 || times > 1000)) return { error: "Enter how many bills in all, from 1 to 1,000." };
  return { every: r.every, everyCount, endsOn: r.end === "on" ? r.endsOn : null, times: r.end === "after" ? times : null };
}

function RepeatFields({ value: r, onChange, dueLabel, min, madeSoFar }: { value: RepeatValue; onChange: (r: RepeatValue) => void; dueLabel: string; min?: string; madeSoFar?: number }) {
  const set = (patch: Partial<RepeatValue>) => onChange({ ...r, ...patch });
  const count = parseNumber(r.everyCount);
  return (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <Field label="Every">
          <TextInput inputMode="numeric" value={r.everyCount} onChange={(e) => set({ everyCount: e.target.value })} aria-label="How many" />
        </Field>
        <Field label="&nbsp;">
          <Select value={r.every} onChange={(e) => set({ every: e.target.value as ExpenseEvery })} aria-label="Days, weeks, months or years">
            {EVERY_UNITS.map((u) => (
              <option key={u} value={u}>
                {everyUnit(u, count > 0 ? count : 1)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className={`grid gap-2 ${r.every === "week" ? "sm:grid-cols-2" : ""}`}>
        {r.every === "week" ? (
          <Field label="On">
            <Select value={r.dueOn ? weekdayOf(r.dueOn) : ""} onChange={(e) => set({ dueOn: onOrAfterWeekday(r.dueOn && (!min || r.dueOn >= min) ? r.dueOn : (min ?? todayHere()), Number(e.target.value)) })}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label={dueLabel}>
          <TextInput type="date" value={r.dueOn} min={min} onChange={(e) => set({ dueOn: e.target.value })} />
        </Field>
      </div>
      <Field label="Stops">
        <Select value={r.end} onChange={(e) => set({ end: e.target.value as RepeatValue["end"] })}>
          <option value="never">Never, until cancelled</option>
          <option value="on">On a date</option>
          <option value="after">After a number of bills</option>
        </Select>
      </Field>
      {r.end === "on" ? (
        <Field label="Last possible due date">
          <TextInput type="date" value={r.endsOn} min={r.dueOn || min} onChange={(e) => set({ endsOn: e.target.value })} />
        </Field>
      ) : null}
      {r.end === "after" ? (
        <Field label="Bills in all" hint={madeSoFar ? `${madeSoFar} made so far count toward it.` : undefined}>
          <TextInput inputMode="numeric" value={r.times} onChange={(e) => set({ times: e.target.value })} />
        </Field>
      ) : null}
      {r.dueOn && count > 0 ? <p className="text-xs text-muted">{repeatLabel(r.every, count, r.dueOn)}, from {day(r.dueOn)}. Each bill appears 14 days before it&apos;s due.</p> : null}
    </div>
  );
}

/** One-time, fixed recurring or varying recurring: the same form, what differs follows the choice. */
/**
 * Record an expense. A one-time one can be noted as already paid, or (the
 * boss, with HivePay) paid now by mobile money as it's saved (owner, 2026-11-13).
 */
function NewExpenseSheet({ categories, today, canSend, onClose }: { categories: ExpenseCategory[]; today: string; canSend: boolean; onClose: () => void }) {
  const router = useRouter();
  const money = useMoney();
  const [ids] = useState(() => ({ expense: crypto.randomUUID(), schedule: crypto.randomUUID(), payment: crypto.randomUUID() }));
  // Saved but the send failed: trying again only sends, with a fresh id (an id sends at most once).
  const [saved, setSaved] = useState(false);
  const [payoutId, setPayoutId] = useState(() => crypto.randomUUID());
  const [type, setType] = useState<"one_time" | "fixed" | "varying">("one_time");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [choices, setChoices] = useState(categories.filter((c) => !c.automatic));
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [spentOn, setSpentOn] = useState(today);
  const [dueOn, setDueOn] = useState("");
  const [repeat, setRepeat] = useState<RepeatValue>({ every: "month", everyCount: "1", dueOn: today, end: "never", endsOn: "", times: "" });
  const [paid, setPaid] = useState<"no" | "already" | "send">("no");
  const [phone, setPhone] = useState("");
  // Sending real money asks once more, as Approve and send does.
  const [sure, setSure] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const pay = usePayFields(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const recurring = type !== "one_time";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseNumber(amount);
    if (!name.trim()) return setError("Say what the expense is.");
    if (!(value > 0) || !Number.isInteger(value)) return setError("Enter the amount in whole shillings.");
    if (!category) return setError("Choose a category.");
    if (category === "__new" && !newCategory.trim()) return setError("Give the new category a name.");
    const how = repeatInput(repeat);
    if (recurring && "error" in how) return setError(how.error);
    const sending = !recurring && paid === "send";
    if (sending && !phone.trim()) return setError("Enter the MTN or Airtel number to send it to.");
    if (sending && (value < 500 || value > 5_000_000)) return setError("HivePay sends from 500 to 5,000,000 at a time.");
    setError(null);
    if (sending && !sure) return setSure(true);
    start(async () => {
      let categoryKey = category;
      if (category === "__new") {
        const added = await addExpenseCategory({ name: newCategory });
        if (!added.ok) return setError(added.error);
        categoryKey = added.data!.key;
        setChoices((c) => [...c, added.data!]);
        setCategory(categoryKey);
      }
      const shared = { name, description, category: categoryKey, amount: value, recipient };
      if (recurring && !("error" in how)) {
        const res = await addExpenseSchedule({ ...shared, ...how, id: ids.schedule, varies: type === "varying", firstDueOn: repeat.dueOn });
        if (!res.ok) return setError(res.error);
        router.refresh();
        return onClose();
      }
      if (!saved) {
        const res = await recordExpense({ ...shared, id: ids.expense, spentOn, dueOn: dueOn || null });
        if (!res.ok) return setError(res.error);
        setSaved(true);
        for (const file of files) {
          const up = await uploadExpenseDocument(ids.expense, file);
          if (!up.ok) return setError(`The expense is saved, but ${file.name} didn't upload. Open the expense and add it again.`);
        }
      }
      if (paid === "already") {
        const done = await payExpense({ ...pay.value, id: ids.payment, expenseId: ids.expense, amount: value, actual: null });
        if (!done.ok) return setError(`The expense is saved, but the payment wasn't: ${done.error} Open the expense to pay it.`);
      }
      if (sending) {
        const sent = await sendExpensePayout({ id: payoutId, expenseId: ids.expense, amount: value, actual: null, phone });
        if (!sent.ok) {
          router.refresh();
          setSure(false);
          setPayoutId(crypto.randomUUID());
          return setError(`The expense is saved, but the money wasn't sent: ${sent.error} Check the number and press again, or close and send it from the expense later.`);
        }
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <FormSheet open onClose={onClose} title="Record expense">
      <form onSubmit={submit} className="space-y-3">
        <Field label="What kind?" hint={type === "one_time" ? "A repair, a one-off purchase." : type === "fixed" ? "Rent, salaries: the same amount each time. Each bill appears by itself." : "Electricity, water: enter what you expect now, and the real amount when paying."}>
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="one_time">One-time</option>
            <option value="fixed">Recurring, same amount</option>
            <option value="varying">Recurring, amount varies</option>
          </Select>
        </Field>
        <Field label="What is it?">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={recurring ? "e.g. Office rent" : "e.g. Generator repair"} />
        </Field>
        <CategoryField choices={choices} category={category} setCategory={setCategory} newCategory={newCategory} setNewCategory={setNewCategory} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={type === "varying" ? "Expected amount" : "Amount"}>
            <TextInput inputMode="numeric" value={amount} disabled={saved || sure} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Who it's for (optional)">
            <TextInput value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={120} />
          </Field>
        </div>
        {recurring ? (
          <RepeatFields value={repeat} onChange={setRepeat} dueLabel="First due date" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Date">
              <TextInput type="date" value={spentOn} max={today} onChange={(e) => setSpentOn(e.target.value)} />
            </Field>
            <Field label="Due date (optional)">
              <TextInput type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Description (optional)">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} />
        </Field>
        {recurring ? null : (
          <>
            <UploadRow
              label="Receipts or invoices"
              hint={files.length ? files.map((f) => f.name).join(", ") : "Photos or PDFs, up to 25 MB each"}
              accept={FILE_TYPES}
              multiple
              disabled={pending}
              onFiles={(list) => setFiles(Array.from(list))}
            />
            <Field label="Paid?">
              <Select
                value={paid}
                disabled={sure}
                onChange={(e) => {
                  setPaid(e.target.value as typeof paid);
                  setSure(false);
                }}
              >
                <option value="no">Not paid yet</option>
                <option value="already">Already paid in full</option>
                {canSend ? <option value="send">Pay now by mobile money</option> : null}
              </Select>
            </Field>
            {paid === "already" ? <PayFields form={pay} /> : null}
            {paid === "send" ? (
              <>
                <Field label="MTN or Airtel number" hint="Sent from Aming's HivePay account as you save. Aming pays HivePay's fee on top, so the phone receives the whole amount.">
                  <TextInput type="tel" value={phone} disabled={sure} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0772 000 000" />
                </Field>
              </>
            ) : null}
          </>
        )}
        <ErrorLine error={error} />
        {sure ? (
          <div className="space-y-2 rounded-xl bg-warning-50 p-3 dark:bg-warning-500/10">
            <p className="text-sm font-medium">
              Save and send {money(parseNumber(amount))} to {phone.trim()}? Real money leaves at once and can&apos;t be pulled back.
            </p>
            <div className="flex gap-2">
              <Button type="submit" loading={pending} className="flex-1">
                Yes, save and send
              </Button>
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setSure(false)}>
                Back
              </Button>
            </div>
          </div>
        ) : (
          <Button type="submit" loading={pending} className="w-full">
            {recurring ? "Save recurring expense" : paid === "send" ? "Save and pay now" : "Save expense"}
          </Button>
        )}
      </form>
    </FormSheet>
  );
}

function CategoryField({
  choices,
  category,
  setCategory,
  newCategory,
  setNewCategory,
}: {
  choices: ExpenseCategory[];
  category: string;
  setCategory: (v: string) => void;
  newCategory: string;
  setNewCategory: (v: string) => void;
}) {
  return (
    <>
      <Field label="Category" hint="Materials are recorded under Production and loan repayments under Money we owe, so they aren't counted twice.">
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="" disabled>
            Choose…
          </option>
          {choices.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
          <option value="__new">New category…</option>
        </Select>
      </Field>
      {category === "__new" ? (
        <Field label="New category name">
          <TextInput value={newCategory} onChange={(e) => setNewCategory(e.target.value)} maxLength={60} />
        </Field>
      ) : null}
    </>
  );
}

function usePayFields(today: string) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const source = useMoneySource(method);
  const [paidOn, setPaidOn] = useState(today);
  const [phone, setPhone] = useState("");
  const [reference, setReference] = useState("");
  return {
    method,
    setMethod,
    accounts: source.accounts,
    setChosen: source.setChosen,
    paidOn,
    setPaidOn,
    phone,
    setPhone,
    reference,
    setReference,
    value: { paidOn, accountId: source.value.accountId, method, phone, reference },
  };
}

function PayFields({ form }: { form: ReturnType<typeof usePayFields> }) {
  const needsReference = form.method === "mobile_money" || form.method === "bank_transfer";
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="How it was paid">
          <Select value={form.method} onChange={(e) => form.setMethod(e.target.value as PaymentMethod)}>
            {["cash", "mobile_money", "bank_transfer", "other"].map((m) => (
              <option key={m} value={m}>
                {METHODS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid from">
          <Select value={form.value.accountId} onChange={(e) => form.setChosen(e.target.value)}>
            {form.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Day it was paid">
        <TextInput type="date" value={form.paidOn} max={todayHere()} onChange={(e) => form.setPaidOn(e.target.value)} />
      </Field>
      {needsReference ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={form.method === "mobile_money" ? "Transaction ID" : "Bank reference"}>
            <TextInput value={form.reference} onChange={(e) => form.setReference(e.target.value)} maxLength={100} />
          </Field>
          <Field label="Phone paid to (optional)">
            <TextInput inputMode="tel" value={form.phone} onChange={(e) => form.setPhone(e.target.value)} maxLength={30} />
          </Field>
        </div>
      ) : null}
    </>
  );
}

function LimitSheet({ above, onClose }: { above: number | null; onClose: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState(above === null ? "" : String(above));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <FormSheet open onClose={onClose} title="Approval limit">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await setExpenseApprovalLimit({ above: value.trim() ? parseNumber(value) : null });
            if (!res.ok) return setError(res.error);
            router.refresh();
            onClose();
          });
        }}
      >
        <Field label="You approve anything above" hint="Leave empty if nothing needs approval. What you record yourself never waits.">
          <TextInput inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <ErrorLine error={error} />
        <Button type="submit" loading={pending} className="w-full">
          Save limit
        </Button>
      </form>
    </FormSheet>
  );
}

/** Why a bill in Ready to send goes by itself, or why it waits for you. */
function AutopayNote({ expense: e, today, timeZone }: { expense: ExpenseLine; today: string; timeZone: string }) {
  if (e.autopayHeldAt) {
    return (
      <span className="mt-1 block text-xs text-warning-700 dark:text-warning-500">
        {e.autopayHoldReason ?? `Held by ${e.autopayHeldBy ?? "you"}`}. Waits for you.
      </span>
    );
  }
  if (e.autopayAt) {
    const at = new Date(e.autopayAt);
    const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
    const onDay = new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
    return <span className="mt-1 block text-xs text-success-700 dark:text-success-500">Sends by itself {onDay === today ? "today" : day(onDay)} at {time}</span>;
  }
  return null;
}

function HoldButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-1 flex-col">
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await holdExpenseAutopay(id);
            if (!res.ok) return setError(res.error);
            router.refresh();
          })
        }
      >
        Hold
      </Button>
      <ErrorLine error={error} />
    </span>
  );
}

/**
 * How much autopay sends without the boss (owner, 2026-11-13). Empty: any
 * amount. Above it, a bill waits in Ready to send for Approve and send.
 */
function AutopayLimitSheet({ upTo, onClose }: { upTo: number | null; onClose: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState(upTo === null ? "" : String(upTo));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <FormSheet open onClose={onClose} title="Autopay limit">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await setExpenseAutopayLimit({ upTo: value.trim() ? parseNumber(value) : null });
            if (!res.ok) return setError(res.error);
            router.refresh();
            onClose();
          });
        }}
      >
        <p className="text-sm text-muted">
          A due bill on autopay is sent by mobile money by itself at its time, after one message to you. Anything above this amount waits in Ready to send for you to approve and send.
        </p>
        <Field label="Send by itself up to" hint="Leave empty to let bills of any amount go by themselves.">
          <TextInput inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <ErrorLine error={error} />
        <Button type="submit" loading={pending} className="w-full">
          Save limit
        </Button>
      </form>
    </FormSheet>
  );
}

/**
 * HivePay's sending fee bands (owner, 2026-11-14: the money goes out full and
 * the charges stay with Aming). HivePay keeps its fee out of what it's sent,
 * so Aming sends the bill or the agent's money plus the fee from these bands.
 * HivePay publishes none: they're copied from HivePay. Without a band for an
 * amount, it's sent as it is and HivePay's fee decides what's still owed.
 */
function SendFeesSheet({ bands, onClose }: { bands: { upTo: number; fee: number }[]; onClose: () => void }) {
  const router = useRouter();
  const money = useMoney();
  const [rows, setRows] = useState(bands.length ? bands.map((b) => ({ upTo: String(b.upTo), fee: String(b.fee) })) : [{ upTo: "", fee: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, key: "upTo" | "fee", value: string) => setRows((now) => now.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  return (
    <FormSheet open onClose={onClose} title="HivePay sending fees">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const filled = rows.filter((r) => r.upTo.trim() || r.fee.trim());
          start(async () => {
            const res = await setHivepaySendFees(filled.map((r) => ({ upTo: parseNumber(r.upTo), fee: parseNumber(r.fee) })));
            if (!res.ok) return setError(res.error);
            router.refresh();
            onClose();
          });
        }}
      >
        <p className="text-sm text-muted">
          Aming pays HivePay&apos;s fee: bills and agents&apos; money are sent with the fee on top, so the phone receives the full amount. Copy HivePay&apos;s fee for each band: the fee for sending up to that amount. If HivePay keeps more than this, an agent gets the difference on their balance and a bill keeps the rest owing.
        </p>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <Field label={i === 0 ? "Sending up to" : ""}>
                <TextInput inputMode="numeric" value={r.upTo} onChange={(e) => set(i, "upTo", e.target.value)} placeholder="e.g. 40,000" />
              </Field>
              <Field label={i === 0 ? "Fee" : ""}>
                <TextInput inputMode="numeric" value={r.fee} onChange={(e) => set(i, "fee", e.target.value)} placeholder="e.g. 1,000" />
              </Field>
              <Button type="button" variant="ghost" size="sm" aria-label="Remove band" onClick={() => setRows((now) => now.filter((_, j) => j !== i))}>
                ✕
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setRows((now) => [...now, { upTo: "", fee: "" }])}>
          + Add band
        </Button>
        {bands.length ? <p className="text-xs text-muted">Highest band: up to {money(Math.max(...bands.map((b) => b.upTo)))}. Above it, amounts go without the fee on top.</p> : null}
        <ErrorLine error={error} />
        <Button type="submit" loading={pending} className="w-full">
          Save fees
        </Button>
      </form>
    </FormSheet>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

/** One expense: what it is, every payment, its documents, and what can be done next. */
function ExpenseSheet({
  expense: e,
  today,
  isBoss,
  canSend,
  startSending,
  timeZone,
  onClose,
}: {
  expense: ExpenseLine;
  today: string;
  isBoss: boolean;
  canSend: boolean;
  startSending: boolean;
  timeZone: string;
  onClose: () => void;
}) {
  const manage = useContext(CanManage);
  const money = useMoney();
  const router = useRouter();
  const [detail, setDetail] = useState<ExpenseDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "pay" | "send" | "void" | "reject">(startSending && canSend ? "send" : "view");
  const [voidingPayment, setVoidingPayment] = useState<ExpensePayment | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const status = expenseStatus(e, today);
  const left = expenseBalance(e);
  const closed = e.voidedAt !== null || e.approval === "rejected";

  const load = useCallback(async () => {
    const res = await getExpenseDetail(e.id);
    if (res.ok) setDetail(res.data ?? null);
    else setLoadError(res.error);
  }, [e.id]);
  useEffect(() => {
    getExpenseDetail(e.id).then((res) => {
      if (res.ok) setDetail(res.data ?? null);
      else setLoadError(res.error);
    });
  }, [e.id]);
  const refresh = async () => {
    router.refresh();
    await load();
  };

  async function addFiles(list: FileList) {
    setError(null);
    for (const file of Array.from(list)) {
      setUploading(0);
      const res = await uploadExpenseDocument(e.id, file, setUploading);
      if (!res.ok) setError(`${file.name}: ${res.error}`);
    }
    setUploading(null);
    await refresh();
  }

  const livePayments = (detail?.payments ?? []).filter((p) => !p.voidedAt);
  const sending = (detail?.payouts ?? []).some((p) => p.status === "sending");

  return (
    <>
      <FormSheet open onClose={onClose} title={e.name}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <StatusBadge status={status} />
            <span className="text-lg font-bold tnum">
              {e.amountIsEstimate ? "About " : ""}
              {money(e.amount)}
            </span>
          </div>

          <dl className="divide-y divide-border">
            <Row label="Category">{e.categoryName}</Row>
            {e.recipient ? <Row label="To">{e.recipient}</Row> : null}
            <Row label="Date">{day(e.spentOn)}</Row>
            {e.dueOn ? <Row label="Due">{day(e.dueOn)}</Row> : null}
            {e.scheduleEvery ? <Row label="Repeats">{repeatLabel(e.scheduleEvery, e.scheduleEveryCount ?? 1, e.dueOn)}</Row> : null}
            {e.paidFrom.length ? <Row label="Paid from">{e.paidFrom.join(", ")}</Row> : null}
            <Row label="Paid">{money(e.paid)}</Row>
            <Row label="Left to pay">{money(left)}</Row>
            {e.description ? <Row label="Description">{e.description}</Row> : null}
            <Row label="Recorded by">
              {e.recordedBy}, {formatDayTime(e.recordedAt, timeZone)}
            </Row>
            {e.approvedBy ? (
              <Row label={e.approval === "rejected" ? "Rejected by" : "Approved by"}>
                {e.approvedBy}
                {e.approvalNote ? `: ${e.approvalNote}` : ""}
              </Row>
            ) : null}
            {e.voidedAt ? (
              <Row label="Voided by">
                {e.voidedBy}: {e.voidReason}
              </Row>
            ) : null}
            {e.restoredBy ? <Row label="Restored by">{e.restoredBy}</Row> : null}
          </dl>

          {e.voidedWithSchedule && e.voidedAt ? (
            <div className="space-y-2 rounded-2xl border border-border p-3">
              <p className="text-sm text-muted">Voided with its recurring expense&apos;s pause or cancel. Restore it if that was a mistake: it&apos;s owed again, as it was.</p>
              <Button
                variant="secondary"
                loading={pending}
                onClick={() =>
                  start(async () => {
                    const res = await restoreExpense(e.id);
                    if (!res.ok) return setError(res.error);
                    router.refresh();
                  })
                }
              >
                Restore this bill
              </Button>
            </div>
          ) : null}

          {e.automatic ? (
            <p className="text-sm text-muted">This one records itself from a material purchase, a loan repayment or a HivePay collection.</p>
          ) : null}

          {e.approval === "waiting" && isBoss && !closed ? (
            <div className="flex gap-2">
              <Button
                loading={pending}
                className="flex-1"
                onClick={() =>
                  start(async () => {
                    const res = await decideExpense({ id: e.id, approve: true });
                    if (!res.ok) return setError(res.error);
                    router.refresh();
                  })
                }
              >
                Approve
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setMode("reject")}>
                Reject
              </Button>
            </div>
          ) : null}
          {e.approval === "waiting" && !isBoss ? <p className="text-sm text-muted">Waiting for the boss to approve it before it can be paid.</p> : null}

          {manage && !e.automatic && !closed && left > 0 && (e.approval === "approved" || isBoss) ? (
            mode === "pay" ? (
              <PayForm expense={e} today={today} onDone={refresh} onCancel={() => setMode("view")} />
            ) : mode === "send" ? (
              <SendForm expense={e} onDone={refresh} onCancel={() => setMode("view")} />
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" onClick={() => setMode("pay")} disabled={sending}>
                  Record a payment
                </Button>
                {canSend ? (
                  <Button variant="secondary" className="flex-1" onClick={() => setMode("send")} disabled={sending || e.payoutSending}>
                    Pay by mobile money
                  </Button>
                ) : null}
              </div>
            )
          ) : null}

          {detail?.payouts.length ? (
            <Card title="Sent through HivePay">
              <ul className="divide-y divide-border text-sm">
                {detail.payouts.map((p) => (
                  <li key={p.id} className="py-2">
                    <p className="font-semibold tnum">
                      {money(p.amount)} to {localPhone(p.phone)}
                    </p>
                    <p className={`text-xs ${p.status === "failed" ? "text-error-600 dark:text-error-400" : "text-muted"}`}>
                      {p.status === "failed" ? `Didn't go through: ${p.error ?? "no reason given"}` : "On its way. It counts as paid once HivePay confirms it."} · {p.sentBy}, {formatDayTime(p.sentAt, timeZone)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {detail === null ? (
            <p className="text-sm text-muted">{loadError ?? "Loading…"}</p>
          ) : e.automatic ? null : (
            <>
              <Card title="Payments">
                {detail.payments.length === 0 ? (
                  <p className="text-sm text-muted">None yet.</p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {detail.payments.map((p) => (
                      <li key={p.id} className="py-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className={`font-semibold tnum ${p.voidedAt ? "text-muted line-through" : ""}`}>{money(p.amount)}</span>
                          <span className="flex gap-3 text-xs">
                            <a href={`/dashboard/receipts/expense/${p.id}`} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                              Receipt
                            </a>
                            {p.voidedAt || !manage ? null : (
                              <button type="button" className="text-muted underline" onClick={() => setVoidingPayment(p)}>
                                Void
                              </button>
                            )}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">
                          {day(p.paidOn)} · {METHODS[p.method] ?? p.method} · From {p.accountName}
                          {p.reference ? ` · ${p.reference}` : ""}
                          {p.phone ? ` · ${p.phone}` : ""} · By {p.recordedBy}
                        </p>
                        {p.voidedAt ? (
                          <p className="mt-0.5 text-xs text-error-600">
                            Voided by {p.voidedBy}: {p.voidReason}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Documents">
                {detail.documents.length ? (
                  <ul className="mb-3 divide-y divide-border text-sm">
                    {detail.documents.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 py-1.5">
                        {d.url ? (
                          <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-brand-600 underline">
                            {d.fileName}
                          </a>
                        ) : (
                          <span className="min-w-0 truncate">{d.fileName}</span>
                        )}
                        <span className="shrink-0 text-xs text-muted">{d.recordedBy}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {manage ? <UploadRow label="Add a receipt or invoice" hint="Photos or PDFs, up to 25 MB each" accept={FILE_TYPES} multiple disabled={uploading !== null} progress={uploading} onFiles={addFiles} /> : null}
              </Card>
            </>
          )}

          <ErrorLine error={error} />

          {manage && !e.automatic && !closed && livePayments.length === 0 && detail !== null ? (
            <button type="button" className="text-xs text-muted underline" onClick={() => setMode("void")}>
              Void this expense
            </button>
          ) : null}
        </div>
      </FormSheet>

      <VoidSheet
        open={mode === "void"}
        onClose={() => setMode("view")}
        title="Void expense"
        explain="It stays on record, marked voided, with your reason. It no longer counts as owed."
        run={async (reason) => {
          const res = await voidExpense({ id: e.id, reason });
          if (res.ok) router.refresh();
          return res.ok ? { ok: true } : res;
        }}
      />
      <VoidSheet
        open={mode === "reject"}
        onClose={() => setMode("view")}
        title="Reject expense"
        explain="It stays on record as rejected, with your reason, and can't be paid."
        run={async (note) => {
          const res = await decideExpense({ id: e.id, approve: false, note });
          if (res.ok) router.refresh();
          return res.ok ? { ok: true } : res;
        }}
      />
      {voidingPayment ? (
        <VoidSheet
          open
          onClose={() => setVoidingPayment(null)}
          title="Void payment"
          explain={`The ${money(voidingPayment.amount)} goes back into ${voidingPayment.accountName} on Today, and back into what's left to pay. A closed day can't change.`}
          run={async (reason) => {
            const res = await voidExpensePayment({ id: voidingPayment.id, reason });
            if (res.ok) await refresh();
            return res.ok ? { ok: true } : res;
          }}
        />
      ) : null}
    </>
  );
}

function PayForm({ expense: e, today, onDone, onCancel }: { expense: ExpenseLine; today: string; onDone: () => Promise<void>; onCancel: () => void }) {
  const money = useMoney();
  const [id] = useState(() => crypto.randomUUID());
  const left = expenseBalance(e);
  const [amount, setAmount] = useState(e.amountIsEstimate ? "" : String(left));
  const [actual, setActual] = useState("");
  const pay = usePayFields(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = parseNumber(amount || actual);
    const real = e.amountIsEstimate ? parseNumber(actual) : null;
    if (e.amountIsEstimate && !(real! > 0)) return setError("Enter the real amount.");
    if (!(value > 0) || !Number.isInteger(value)) return setError("Enter the amount paid in whole shillings.");
    if (value > (real ?? left)) return setError(`That's more than the ${money(real ?? left)} left to pay.`);
    setError(null);
    start(async () => {
      const res = await payExpense({ ...pay.value, id, expenseId: e.id, amount: value, actual: real });
      if (!res.ok) return setError(res.error);
      onCancel();
      await onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border p-3">
      <p className="text-sm font-semibold">Record a payment</p>
      {e.amountIsEstimate ? (
        <Field label="Real amount this time" hint={`Expected about ${money(e.amount)}.`}>
          <TextInput inputMode="numeric" value={actual} onChange={(ev) => setActual(ev.target.value)} />
        </Field>
      ) : null}
      <Field label="Amount paid now" hint={e.amountIsEstimate ? "Leave empty if it's the whole amount." : `${money(left)} left. Pay less for a part payment.`}>
        <TextInput inputMode="numeric" value={amount} onChange={(ev) => setAmount(ev.target.value)} />
      </Field>
      <PayFields form={pay} />
      <ErrorLine error={error} />
      <div className="flex gap-2">
        <Button type="submit" loading={pending} className="flex-1">
          Save payment
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Real money leaves at once, so it asks a second time, with everything spelled out. */
function SendForm({ expense: e, onDone, onCancel }: { expense: ExpenseLine; onDone: () => Promise<void>; onCancel: () => void }) {
  const money = useMoney();
  const [id] = useState(() => crypto.randomUUID());
  const left = expenseBalance(e);
  const [actual, setActual] = useState("");
  const [amount, setAmount] = useState(e.amountIsEstimate ? "" : String(left));
  const [phone, setPhone] = useState(e.payPhone ? localPhone(e.payPhone) : "");
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const real = e.amountIsEstimate ? parseNumber(actual) : null;
  const value = parseNumber(amount || actual);
  const most = real ?? left;
  const problem = !(value > 0) ? null : value > most ? `That's more than the ${money(most)} left to pay.` : value < 500 || value > 5_000_000 ? "HivePay sends from 500 to 5,000,000 at a time." : null;
  const ready = value > 0 && !problem && phone.trim() !== "" && (!e.amountIsEstimate || real! > 0);

  function send() {
    setError(null);
    start(async () => {
      const res = await sendExpensePayout({ id, expenseId: e.id, amount: value, actual: real, phone });
      if (!res.ok) {
        setSure(false);
        return setError(res.error);
      }
      onCancel();
      await onDone();
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      <p className="text-sm font-semibold">Pay by mobile money</p>
      {e.approval === "waiting" ? <p className="text-sm text-muted">Sending it approves it.</p> : null}
      {e.amountIsEstimate ? (
        <Field label="Real amount this time" hint={`Expected about ${money(e.amount)}.`}>
          <TextInput inputMode="numeric" value={actual} disabled={sure} onChange={(ev) => setActual(ev.target.value)} />
        </Field>
      ) : null}
      <Field label="Amount to send" hint={e.amountIsEstimate ? "Leave empty if it's the whole amount." : `${money(left)} left. Send less for a part payment.`}>
        <TextInput inputMode="numeric" value={amount} disabled={sure} onChange={(ev) => setAmount(ev.target.value)} />
      </Field>
      <Field label="MTN or Airtel number">
        <TextInput type="tel" value={phone} disabled={sure} onChange={(ev) => setPhone(ev.target.value)} placeholder="e.g. 0772 000 000" />
      </Field>
      {problem ? <p className="text-sm text-error-600 dark:text-error-400">{problem}</p> : null}
      {ready ? (
        <p className="text-sm text-muted">
          The phone receives {money(value)}. Aming pays HivePay&apos;s fee on top, out of its HivePay account, and it&apos;s recorded as a HivePay sending fee expense.
        </p>
      ) : null}
      <ErrorLine error={error} />
      {sure ? (
        <div className="space-y-2 rounded-xl bg-warning-50 p-3 dark:bg-warning-500/10">
          <p className="text-sm font-medium">
            Send {money(value)} to {phone.trim()}? Real money leaves at once and can&apos;t be pulled back.
          </p>
          <div className="flex gap-2">
            <Button loading={pending} disabled={pending} className="flex-1" onClick={send}>
              Yes, send {money(value)}
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setSure(false)}>
              Change
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!ready} onClick={() => setSure(true)}>
            Continue
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

/** A recurring expense's bills: still owed, and voided with its pause or cancel (they can be restored). */
function billsOf(s: ExpenseSchedule, lines: ExpenseLine[]) {
  const mine = lines.filter((l) => l.scheduleId === s.id).sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
  return { owed: mine.filter((l) => expenseBalance(l) > 0), restorable: mine.filter((l) => l.voidedWithSchedule && l.voidedAt) };
}

/** When the next bill is due: the earliest still owed from today on, or the next to be created. */
function nextDue(s: ExpenseSchedule, owed: ExpenseLine[], today: string): string | null {
  const created = owed.map((l) => l.dueOn).find((d): d is string => !!d && d >= today) ?? null;
  const planned = scheduleState(s) === "running" ? s.nextCreatedOn : null;
  if (!created) return planned;
  if (!planned) return created;
  return created < planned ? created : planned;
}

function SchedulesList({
  schedules,
  lines,
  today,
  categories,
  canSend,
  onOpenLine,
}: {
  schedules: ExpenseSchedule[];
  lines: ExpenseLine[];
  today: string;
  categories: ExpenseCategory[];
  canSend: boolean;
  onOpenLine: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showEnded, setShowEnded] = useState(false);
  const opened = schedules.find((s) => s.id === openId) ?? null;
  if (!schedules.length) return <EmptyState>Nothing repeats yet. Record rent, salaries or electricity as a recurring expense.</EmptyState>;
  const live = schedules.filter((s) => !s.endedAt);
  const ended = schedules.filter((s) => s.endedAt);
  return (
    <div className="space-y-4">
      {live.length ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {live.map((s) => (
            <li key={s.id}>
              <ScheduleCard schedule={s} lines={lines} today={today} onOpen={() => setOpenId(s.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>No recurring expense is running. Ended ones are below.</EmptyState>
      )}
      {ended.length ? (
        <div className="space-y-3">
          <button type="button" className="text-sm font-medium text-brand-600 underline" onClick={() => setShowEnded((v) => !v)}>
            {showEnded ? "Hide" : "Show"} finished and cancelled ({ended.length})
          </button>
          {showEnded ? (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ended.map((s) => (
                <li key={s.id}>
                  <ScheduleCard schedule={s} lines={lines} today={today} onOpen={() => setOpenId(s.id)} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {opened ? (
        <ScheduleSheet
          key={opened.id}
          schedule={opened}
          lines={lines}
          today={today}
          categories={categories}
          canSend={canSend}
          onOpenLine={(id) => {
            setOpenId(null);
            onOpenLine(id);
          }}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

function ScheduleCard({ schedule: s, lines, today, onOpen }: { schedule: ExpenseSchedule; lines: ExpenseLine[]; today: string; onOpen: () => void }) {
  const money = useMoney();
  const state = scheduleState(s);
  const { owed, restorable } = billsOf(s, lines);
  const next = nextDue(s, owed, today);
  const overdue = owed.filter((l) => expenseStatus(l, today) === "overdue");
  return (
    <button type="button" onClick={onOpen} className="flex h-full w-full flex-col gap-2 rounded-2xl border border-border bg-surface p-3 text-left shadow-theme-xs">
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate font-medium">{s.name}</span>
          <span className="block text-xs text-muted">{repeatLabel(s.every, s.everyCount, s.nextCreatedOn ?? owed[0]?.dueOn)}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold tnum">
            {s.varies ? "About " : ""}
            {money(s.amount)}
          </span>
          <StateBadge state={state} />
        </span>
      </span>
      <span className="text-xs text-muted">{[s.categoryName, s.recipient].filter(Boolean).join(" · ")}</span>
      <span className="grid grid-cols-2 gap-2 text-xs">
        <span>
          <span className="block text-muted">Next due</span>
          <span className="font-medium">{next ? day(next) : state === "paused" ? "Paused" : "—"}</span>
        </span>
        <span>
          <span className="block text-muted">Still owed</span>
          <span className={`font-medium tnum ${overdue.length ? "text-error-600 dark:text-error-400" : ""}`}>
            {owed.length ? `${money(owed.reduce((sum, l) => sum + expenseBalance(l), 0))} · ${owed.length} ${owed.length === 1 ? "bill" : "bills"}` : "Nothing"}
          </span>
        </span>
        <span>
          <span className="block text-muted">Paid so far</span>
          <span className="font-medium tnum">{money(s.paidTotal)}</span>
        </span>
        <span>
          <span className="block text-muted">Ends</span>
          <span className="font-medium">{s.endedAt ? (state === "finished" ? "Finished" : "Cancelled") : s.endsOn ? day(s.endsOn) : s.times ? `After ${s.times} bills (${s.bills} made)` : "Never"}</span>
        </span>
      </span>
      {restorable.length ? (
        <span className="text-xs text-warning-700 dark:text-warning-500">
          {restorable.length} {restorable.length === 1 ? "bill" : "bills"} voided with its {state === "paused" ? "pause" : "cancel"}: open to restore
        </span>
      ) : null}
    </button>
  );
}

/** One recurring expense: its bills, and edit, pause or resume, cancel. */
function ScheduleSheet({
  schedule: s,
  lines,
  today,
  categories,
  canSend,
  onOpenLine,
  onClose,
}: {
  schedule: ExpenseSchedule;
  lines: ExpenseLine[];
  today: string;
  categories: ExpenseCategory[];
  canSend: boolean;
  onOpenLine: (id: string) => void;
  onClose: () => void;
}) {
  const manage = useContext(CanManage);
  const money = useMoney();
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "pause" | "cancel" | "resume" | "autopay">("view");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const state = scheduleState(s);
  const { owed, restorable } = billsOf(s, lines);
  const next = nextDue(s, owed, today);

  const restore = (id: string) =>
    start(async () => {
      setError(null);
      const res = await restoreExpense(id);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });

  if (mode === "edit") return <EditScheduleSheet schedule={s} today={today} categories={categories} onClose={() => setMode("view")} />;
  if (mode === "autopay") return <AutopaySheet schedule={s} onClose={() => setMode("view")} />;
  if (mode === "pause" || mode === "cancel") return <StopScheduleSheet schedule={s} end={mode === "cancel"} lines={lines} today={today} onClose={() => setMode("view")} />;

  return (
    <FormSheet open onClose={onClose} title={s.name}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <StateBadge state={state} />
          <span className="text-lg font-bold tnum">
            {s.varies ? "About " : ""}
            {money(s.amount)}
          </span>
        </div>
        <dl className="divide-y divide-border">
          <Row label="Repeats">{repeatLabel(s.every, s.everyCount, s.nextCreatedOn ?? owed[0]?.dueOn)}</Row>
          <Row label="Next due">{next ? day(next) : state === "paused" ? "Paused" : "—"}</Row>
          <Row label="Category">{s.categoryName}</Row>
          {s.recipient ? <Row label="To">{s.recipient}</Row> : null}
          <Row label="Ends">{s.endsOn ? day(s.endsOn) : s.times ? `After ${s.times} bills` : "Never, until cancelled"}</Row>
          {s.payPhone || canSend ? <Row label="Autopay">{s.payPhone ? `To ${localPhone(s.payPhone)} at ${s.sendAt}, by itself up to your limit` : "Off"}</Row> : null}
          <Row label="Bills so far">{s.bills}</Row>
          <Row label="Paid so far">{money(s.paidTotal)}</Row>
          {s.description ? <Row label="Description">{s.description}</Row> : null}
          <Row label="Set up by">{s.recordedBy}</Row>
          {s.editedBy ? <Row label="Last changed by">{s.editedBy}</Row> : null}
          {s.pausedBy ? <Row label="Paused by">{s.pausedBy}</Row> : null}
          {s.endedAt ? <Row label={state === "finished" ? "Finished" : "Cancelled by"}>{state === "finished" ? "Reached its end" : s.endedBy}</Row> : null}
        </dl>

        {s.endedAt || !manage ? null : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Button variant="secondary" onClick={() => setMode("edit")}>
              Edit
            </Button>
            {state === "paused" ? (
              <Button variant="secondary" onClick={() => setMode("resume")}>
                Resume
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setMode("pause")}>
                Pause
              </Button>
            )}
            <Button variant="danger" className="col-span-2 sm:col-span-1" onClick={() => setMode("cancel")}>
              Cancel it
            </Button>
            {canSend ? (
              <Button variant="secondary" className="col-span-2 sm:col-span-3" onClick={() => setMode("autopay")}>
                {s.payPhone ? "Change autopay" : "Set up autopay"}
              </Button>
            ) : null}
          </div>
        )}

        {mode === "resume" ? (
          <div className="space-y-2 rounded-2xl border border-border p-3">
            <p className="text-sm">Bills that would have come due while it was paused are skipped: nothing is owed for that time. The next bill is the first due date from today.</p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                loading={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const res = await resumeExpenseSchedule(s.id);
                    if (!res.ok) return setError(res.error);
                    router.refresh();
                    setMode("view");
                  })
                }
              >
                Resume it
              </Button>
              <Button variant="secondary" onClick={() => setMode("view")}>
                Not now
              </Button>
            </div>
          </div>
        ) : null}

        <Card title={`Still owed (${owed.length})`}>
          {owed.length === 0 ? (
            <p className="text-sm text-muted">Nothing.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {owed.map((l) => (
                <li key={l.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 py-2 text-left" onClick={() => onOpenLine(l.id)}>
                    <span>
                      <span className="block">{l.dueOn ? `Due ${day(l.dueOn)}` : day(l.spentOn)}</span>
                      <StatusBadge status={expenseStatus(l, today)} />
                    </span>
                    <span className="font-semibold tnum">{money(expenseBalance(l))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {restorable.length ? (
          <Card title="Voided with a pause or cancel">
            <p className="mb-2 text-xs text-muted">Restore one if it was a mistake: it&apos;s owed again, as it was.</p>
            <ul className="divide-y divide-border text-sm">
              {restorable.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <span className="block">{l.dueOn ? `Due ${day(l.dueOn)}` : day(l.spentOn)}</span>
                    <span className="text-xs text-muted">
                      {money(l.amount)} · voided by {l.voidedBy}
                    </span>
                  </span>
                  {manage ? (
                    <Button variant="secondary" loading={pending} onClick={() => restore(l.id)}>
                      Restore
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <ErrorLine error={error} />
      </div>
    </FormSheet>
  );
}

/** The times a bill can go by itself: after the 08:00 messages, before evening. */
const SEND_TIMES = Array.from({ length: 12 }, (_, i) => `${String(9 + i).padStart(2, "0")}:00`);

/**
 * Autopay (owner, 2026-11-12, by itself 2026-11-13): when a bill is due it's
 * sent by mobile money to this number at this time, after one message to the
 * boss, unless it's above the autopay limit or held.
 */
function AutopaySheet({ schedule: s, onClose }: { schedule: ExpenseSchedule; onClose: () => void }) {
  const router = useRouter();
  const [phone, setPhone] = useState(s.payPhone ? localPhone(s.payPhone) : "");
  const [sendAt, setSendAt] = useState(s.sendAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (next: string) =>
    start(async () => {
      setError(null);
      const res = await setExpenseSchedulePayPhone({ id: s.id, phone: next, sendAt });
      if (!res.ok) return setError(res.error);
      router.refresh();
      onClose();
    });

  return (
    <FormSheet open onClose={onClose} title={`Autopay: ${s.name}`}>
      <form
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          save(phone);
        }}
      >
        <p className="text-sm text-muted">
          When a bill is due it&apos;s sent by mobile money by itself at this time. You get one message first, so you can hold it in Ready to send. A bill above your autopay limit, or one whose amount varies, waits for you to approve and send it. Bills not yet paid use the new number and time too.
        </p>
        <Field label="MTN or Airtel number">
          <TextInput type="tel" value={phone} onChange={(ev) => setPhone(ev.target.value)} placeholder="e.g. 0772 000 000" />
        </Field>
        <Field label="Send at" hint="Kampala time, on the day it's due. If you're told less than an hour before, it goes the next day at this time.">
          <Select value={sendAt} onChange={(ev) => setSendAt(ev.target.value)}>
            {SEND_TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <ErrorLine error={error} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" className="flex-1" loading={pending} disabled={!phone.trim()}>
            Save
          </Button>
          {s.payPhone ? (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => save("")}>
              Turn off autopay
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </FormSheet>
  );
}

function EditScheduleSheet({ schedule: s, today, categories, onClose }: { schedule: ExpenseSchedule; today: string; categories: ExpenseCategory[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(s.name);
  const [description, setDescription] = useState(s.description ?? "");
  const [choices, setChoices] = useState(categories.filter((c) => !c.automatic));
  const [category, setCategory] = useState(s.category);
  const [newCategory, setNewCategory] = useState("");
  const [amount, setAmount] = useState(String(s.amount));
  const [varies, setVaries] = useState(s.varies);
  const [recipient, setRecipient] = useState(s.recipient ?? "");
  const next = s.nextCreatedOn && s.nextCreatedOn >= today ? s.nextCreatedOn : today;
  const [repeat, setRepeat] = useState<RepeatValue>({
    every: s.every,
    everyCount: String(s.everyCount),
    dueOn: next,
    end: s.endsOn ? "on" : s.times ? "after" : "never",
    endsOn: s.endsOn ?? "",
    times: s.times ? String(s.times) : "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseNumber(amount);
    if (!name.trim()) return setError("Say what the expense is.");
    if (!(value > 0) || !Number.isInteger(value)) return setError("Enter the amount in whole shillings.");
    if (category === "__new" && !newCategory.trim()) return setError("Give the new category a name.");
    if (repeat.dueOn < today) return setError("The next due date can't be in the past.");
    const how = repeatInput(repeat);
    if ("error" in how) return setError(how.error);
    setError(null);
    start(async () => {
      let categoryKey = category;
      if (category === "__new") {
        const added = await addExpenseCategory({ name: newCategory });
        if (!added.ok) return setError(added.error);
        categoryKey = added.data!.key;
        setChoices((c) => [...c, added.data!]);
        setCategory(categoryKey);
      }
      const res = await editExpenseSchedule({ id: s.id, name, description, category: categoryKey, amount: value, varies, recipient, ...how, nextDueOn: repeat.dueOn });
      if (!res.ok) return setError(res.error);
      router.refresh();
      onClose();
    });
  }

  return (
    <FormSheet open onClose={onClose} title={`Edit ${s.name}`}>
      <form onSubmit={submit} className="space-y-3">
        <p className="rounded-xl bg-gray-100 p-3 text-sm text-muted dark:bg-white/5">Only bills not made yet follow your changes. Bills already made keep their amount and date; pay or void them as they are.</p>
        <Field label="What is it?">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        <CategoryField choices={choices} category={category} setCategory={setCategory} newCategory={newCategory} setNewCategory={setNewCategory} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={varies ? "Expected amount" : "Amount"}>
            <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Who it's for (optional)">
            <TextInput value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={120} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={varies} onChange={(e) => setVaries(e.target.checked)} />
          The amount varies (the real one is entered when paying)
        </label>
        <RepeatFields value={repeat} onChange={setRepeat} dueLabel="Next bill due" min={today} madeSoFar={s.bills} />
        <Field label="Description (optional)">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} />
        </Field>
        <ErrorLine error={error} />
        <Button type="submit" loading={pending} className="w-full">
          Save changes
        </Button>
      </form>
    </FormSheet>
  );
}

/**
 * Pause or cancel. Its unpaid bills are listed one by one, so nobody stops it
 * without seeing what's still owed; ticked ones are voided with it, and can be
 * restored. A bill with a payment on it can't be voided here.
 */
function StopScheduleSheet({ schedule: s, end, lines, today, onClose }: { schedule: ExpenseSchedule; end: boolean; lines: ExpenseLine[]; today: string; onClose: () => void }) {
  const money = useMoney();
  const router = useRouter();
  const { owed } = billsOf(s, lines);
  // A pause only touches bills from today on; a cancel, every unpaid one.
  const bills = end ? owed : owed.filter((l) => (l.dueOn ?? l.spentOn) >= today);
  const voidable = bills.filter((l) => l.paid === 0);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const all = voidable.length > 0 && voidable.every((l) => chosen.has(l.id));
  const verb = end ? "Cancel" : "Pause";
  const chosenTotal = voidable.filter((l) => chosen.has(l.id)).reduce((sum, l) => sum + l.amount, 0);

  const toggle = (id: string) =>
    setChosen((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (done !== null) {
    return (
      <FormSheet open onClose={onClose} title={end ? `${s.name} is cancelled` : `${s.name} is paused`}>
        <div className="space-y-3">
          <p className="text-sm">
            {end ? "No more bills will be made." : "No bills will be made until you resume it."}{" "}
            {done ? `${done} unpaid ${done === 1 ? "bill was" : "bills were"} voided with it. You can restore ${done === 1 ? "it" : "them"} from this recurring expense.` : "Its bills already made stay owed."}
          </p>
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </FormSheet>
    );
  }

  return (
    <FormSheet open onClose={onClose} title={`${verb} ${s.name}?`}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {end ? "No more bills will be made. This can't be undone: to start again, record it anew." : "No bills will be made while it's paused. When you resume, what would have come due meanwhile is skipped."}
        </p>

        <div className="space-y-2 rounded-2xl border-2 border-warning-300 bg-warning-50 p-3 dark:border-warning-500/40 dark:bg-warning-500/10">
          <p className="text-sm font-semibold">
            {bills.length === 0 ? "It has no unpaid bills" : `It has ${bills.length} unpaid ${bills.length === 1 ? "bill" : "bills"}${end ? "" : " from today on"}`}
          </p>
          {bills.length ? (
            <>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={all} disabled={!voidable.length} onChange={(e) => setChosen(e.target.checked ? new Set(voidable.map((l) => l.id)) : new Set())} />
                Also void its unpaid bills
              </label>
              <ul className="divide-y divide-warning-200 text-sm dark:divide-white/10">
                {bills.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                    <label className="flex min-w-0 items-center gap-2">
                      <input type="checkbox" checked={chosen.has(l.id)} disabled={l.paid > 0} onChange={() => toggle(l.id)} />
                      <span className="min-w-0">
                        <span className="block">{l.dueOn ? `Due ${day(l.dueOn)}` : day(l.spentOn)}</span>
                        <span className="block text-xs text-muted">{l.paid > 0 ? `${money(l.paid)} already paid: stays owed, pay or void it from the bill` : EXPENSE_STATUS_LABELS[expenseStatus(l, today)]}</span>
                      </span>
                    </label>
                    <span className="shrink-0 font-semibold tnum">{money(expenseBalance(l))}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">
                {chosen.size
                  ? `${chosen.size} ${chosen.size === 1 ? "bill" : "bills"} (${money(chosenTotal)}) will be voided. They stay on record and can be restored later.`
                  : "Nothing ticked: these bills stay owed."}
              </p>
            </>
          ) : null}
        </div>

        <ErrorLine error={error} />
        <div className="flex gap-2">
          <Button
            variant={end ? "danger" : "primary"}
            className="flex-1"
            loading={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await stopExpenseSchedule({ id: s.id, end, voidIds: [...chosen] });
                if (!res.ok) return setError(res.error);
                router.refresh();
                setDone(res.data ?? 0);
              })
            }
          >
            {verb} it{chosen.size ? ` and void ${chosen.size}` : ""}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>
    </FormSheet>
  );
}
