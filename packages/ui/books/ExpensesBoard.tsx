"use client";

// Accounts → Expenses: one-time, fixed recurring and varying recurring, all in
// one list. Status comes from the payments. Forms sit in form sheets; the list
// is cards on a phone and a table from md. Boss and supervisors record and pay;
// the boss approves what's above the limit.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";

import { Button } from "@repo/ui/Button";
import { DataTable, type DataTableColumn } from "@repo/ui/DataTable";
import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { TableFilters } from "@repo/ui/TableFilters";
import { UploadRow } from "@repo/ui/UploadRow";
import { PeriodPicker } from "@repo/ui/accounting/PeriodPicker";
import { Card, EmptyState, FigureTile, formatDayTime, useMoney } from "@repo/ui/accounting/shared";
import { ChartCard, RankBars, SERIES } from "@repo/ui/charts/kit";
import { DAY_PERIOD_PRESETS, type Period } from "@repo/lib/accounting/core/period";
import { VoidSheet, parseNumber } from "@repo/ui/production/sheets";
import { localPhone } from "@repo/lib/wallet/policy";
import { todayHere, useMoneySource } from "@repo/ui/wallet/MoneySourceFields";
import {
  addExpenseCategory,
  addExpenseSchedule,
  decideExpense,
  endExpenseSchedule,
  getExpenseDetail,
  payExpense,
  sendExpensePayout,
  recordExpense,
  setExpenseApprovalLimit,
  voidExpense,
  voidExpensePayment,
} from "@repo/lib/books/actions";
import { uploadExpenseDocument } from "@repo/lib/books/expense-documents";
import {
  EVERY_LABELS,
  EXPENSE_STATUS_LABELS,
  HIVEPAY_SEND_FEES,
  expenseBalance,
  expenseStatus,
  hivepaySendFee,
  type ExpenseCategory,
  type ExpenseDetail,
  type ExpenseEvery,
  type ExpenseLine,
  type ExpensePayment,
  type ExpenseSchedule,
  type ExpenseStatus,
  type ExpenseSummary,
} from "@repo/lib/books/expenses";
import type { PaymentMethod } from "@repo/lib/wallet/types";

const METHODS: Record<string, string> = { cash: "Cash", mobile_money: "Mobile money", bank_transfer: "Bank transfer", other: "Other" };
const FILE_TYPES = "image/*,application/pdf";

type Tab = "to_pay" | "overdue" | "waiting" | "paid" | "recurring" | "voided" | "all";

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

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));

function StatusBadge({ status }: { status: ExpenseStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>{EXPENSE_STATUS_LABELS[status]}</span>;
}

function matches(e: ExpenseLine, query: string): boolean {
  if (!query) return true;
  return [e.name, e.recipient ?? "", e.categoryName, e.description ?? "", e.recordedBy].some((f) => f.toLowerCase().includes(query));
}

export function ExpensesBoard({
  today,
  lines,
  summary,
  period,
  categories,
  schedules,
  approvalAbove,
  isBoss,
  timeZone,
}: {
  today: string;
  lines: ExpenseLine[];
  summary: ExpenseSummary;
  period: Period;
  categories: ExpenseCategory[];
  schedules: ExpenseSchedule[];
  approvalAbove: number | null;
  isBoss: boolean;
  timeZone: string;
}) {
  const money = useMoney();
  const [tab, setTab] = useState<Tab>("to_pay");
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<"new" | "limit" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const query = search.trim().toLowerCase();
  const opened = lines.find((l) => l.id === openId) ?? null;

  const status = (e: ExpenseLine) => expenseStatus(e, today);
  const inTab: Record<Exclude<Tab, "recurring">, (e: ExpenseLine) => boolean> = {
    to_pay: (e) => ["unpaid", "part_paid", "overdue", "waiting"].includes(status(e)),
    overdue: (e) => status(e) === "overdue",
    waiting: (e) => status(e) === "waiting",
    paid: (e) => status(e) === "paid" || status(e) === "on_credit",
    voided: (e) => status(e) === "voided" || status(e) === "rejected",
    all: () => true,
  };
  const count = (k: Exclude<Tab, "recurring">) => lines.filter(inTab[k]).length;

  const shown = tab === "recurring" ? [] : lines.filter(inTab[tab]).filter((e) => matches(e, query));
  // What's still to pay: soonest first, so the next thing due is at the top.
  const visible = tab === "to_pay" || tab === "overdue" || tab === "waiting" ? [...shown].sort((a, b) => (a.dueOn ?? a.spentOn).localeCompare(b.dueOn ?? b.spentOn)) : shown;

  const columns: DataTableColumn<ExpenseLine>[] = [
    { key: "name", header: "Expense", render: (e) => <span className="font-medium">{e.name}</span> },
    { key: "recipient", header: "To", render: (e) => e.recipient ?? "—" },
    { key: "category", header: "Category", render: (e) => e.categoryName },
    { key: "date", header: "Date", render: (e) => day(e.spentOn) },
    { key: "due", header: "Due", render: (e) => (e.dueOn ? day(e.dueOn) : "—") },
    { key: "amount", header: "Amount", align: "right", render: (e) => `${e.amountIsEstimate ? "About " : ""}${money(e.amount)}` },
    { key: "left", header: "Left to pay", align: "right", render: (e) => money(expenseBalance(e)) },
    { key: "status", header: "Status", render: (e) => <StatusBadge status={status(e)} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setSheet("new")}>Record expense</Button>
        {isBoss ? (
          <Button variant="secondary" onClick={() => setSheet("limit")}>
            Approval limit: {approvalAbove === null ? "none" : money(approvalAbove)}
          </Button>
        ) : approvalAbove !== null ? (
          <p className="text-xs text-muted">The boss approves anything above {money(approvalAbove)}.</p>
        ) : null}
      </div>

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

      <TableFilters
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search expense, who it's for, category or staff…"
        searchLabel="Search expenses"
        value={tab}
        onChange={(k: Tab) => setTab(k)}
        tabs={[
          { key: "to_pay", label: "To pay", count: count("to_pay") },
          { key: "overdue", label: "Overdue", count: count("overdue"), tone: "warning" },
          { key: "waiting", label: "Waiting for approval", count: count("waiting"), tone: "warning" },
          { key: "paid", label: "Paid", count: count("paid") },
          { key: "recurring", label: "Recurring", count: schedules.filter((s) => !s.endedAt).length },
          { key: "voided", label: "Voided or rejected", count: count("voided") },
          { key: "all", label: "All" },
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
          { key: "recordedBy", label: "Recorded by" },
        ]}
      />

      {tab === "recurring" ? (
        <SchedulesList schedules={schedules} />
      ) : visible.length === 0 ? (
        <EmptyState>{query ? `Nothing matches “${search.trim()}”.` : "Nothing here."}</EmptyState>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {visible.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setOpenId(e.id)} className="w-full rounded-2xl border border-border bg-surface p-3 text-left shadow-theme-xs">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{e.name}</span>
                    <span className="shrink-0 font-semibold tnum">{money(e.amount)}</span>
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {[e.recipient, e.categoryName, e.dueOn ? `Due ${day(e.dueOn)}` : day(e.spentOn)].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-2">
                    <StatusBadge status={status(e)} />
                    {expenseBalance(e) > 0 && e.paid > 0 ? <span className="text-xs text-muted tnum">{money(expenseBalance(e))} left</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <DataTable className="hidden md:block" columns={columns} rows={visible} rowKey={(e) => e.id} onRowClick={(e) => setOpenId(e.id)} />
        </>
      )}

      {sheet === "new" ? <NewExpenseSheet categories={categories} today={today} onClose={() => setSheet(null)} /> : null}
      {sheet === "limit" ? <LimitSheet above={approvalAbove} onClose={() => setSheet(null)} /> : null}
      {opened ? <ExpenseSheet key={opened.id} expense={opened} today={today} isBoss={isBoss} timeZone={timeZone} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="text-xs text-error-600">{error}</p> : null;
}

/** One-time, fixed recurring or varying recurring: the same form, what differs follows the choice. */
function NewExpenseSheet({ categories, today, onClose }: { categories: ExpenseCategory[]; today: string; onClose: () => void }) {
  const router = useRouter();
  const [ids] = useState(() => ({ expense: crypto.randomUUID(), schedule: crypto.randomUUID(), payment: crypto.randomUUID() }));
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
  const [every, setEvery] = useState<ExpenseEvery>("month");
  const [firstDue, setFirstDue] = useState(today);
  const [paidNow, setPaidNow] = useState(false);
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
      const shared = { name, description, category: categoryKey, amount: value, recipient };
      if (recurring) {
        const res = await addExpenseSchedule({ ...shared, id: ids.schedule, varies: type === "varying", every, firstDueOn: firstDue });
        if (!res.ok) return setError(res.error);
        router.refresh();
        return onClose();
      }
      const res = await recordExpense({ ...shared, id: ids.expense, spentOn, dueOn: dueOn || null });
      if (!res.ok) return setError(res.error);
      for (const file of files) {
        const up = await uploadExpenseDocument(ids.expense, file);
        if (!up.ok) return setError(`The expense is saved, but ${file.name} didn't upload. Open the expense and add it again.`);
      }
      if (paidNow) {
        const paid = await payExpense({ ...pay.value, id: ids.payment, expenseId: ids.expense, amount: value, actual: null });
        if (!paid.ok) return setError(`The expense is saved, but the payment wasn't: ${paid.error} Open the expense to pay it.`);
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <FormSheet open onClose={onClose} title="Record expense">
      <form onSubmit={submit} className="space-y-3">
        <Field label="What kind?" hint={type === "one_time" ? "A repair, a one-off purchase." : type === "fixed" ? "Rent, salaries: the same amount each time. The next one appears by itself." : "Electricity, water: enter what you expect now, and the real amount when paying."}>
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="one_time">One-time</option>
            <option value="fixed">Recurring, same amount</option>
            <option value="varying">Recurring, amount varies</option>
          </Select>
        </Field>
        <Field label="What is it?">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={recurring ? "e.g. Office rent" : "e.g. Generator repair"} />
        </Field>
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
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={type === "varying" ? "Expected amount" : "Amount"}>
            <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Who it's for (optional)">
            <TextInput value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={120} />
          </Field>
        </div>
        {recurring ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="How often">
              <Select value={every} onChange={(e) => setEvery(e.target.value as ExpenseEvery)}>
                {(Object.keys(EVERY_LABELS) as ExpenseEvery[]).map((k) => (
                  <option key={k} value={k}>
                    {EVERY_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="First due date">
              <TextInput type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
            </Field>
          </div>
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
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} />
              Already paid in full
            </label>
            {paidNow ? <PayFields form={pay} /> : null}
          </>
        )}
        <ErrorLine error={error} />
        <Button type="submit" loading={pending} className="w-full">
          {recurring ? "Save recurring expense" : "Save expense"}
        </Button>
      </form>
    </FormSheet>
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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

/** One expense: what it is, every payment, its documents, and what can be done next. */
function ExpenseSheet({ expense: e, today, isBoss, timeZone, onClose }: { expense: ExpenseLine; today: string; isBoss: boolean; timeZone: string; onClose: () => void }) {
  const money = useMoney();
  const router = useRouter();
  const [detail, setDetail] = useState<ExpenseDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "pay" | "send" | "void" | "reject">("view");
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
            {e.scheduleEvery ? <Row label="Repeats">{EVERY_LABELS[e.scheduleEvery]}</Row> : null}
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
          </dl>

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

          {!e.automatic && !closed && left > 0 && (e.approval === "approved" || isBoss) ? (
            mode === "pay" ? (
              <PayForm expense={e} today={today} onDone={refresh} onCancel={() => setMode("view")} />
            ) : mode === "send" ? (
              <SendForm expense={e} onDone={refresh} onCancel={() => setMode("view")} />
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" onClick={() => setMode("pay")} disabled={sending}>
                  Record a payment
                </Button>
                {isBoss && HIVEPAY_SEND_FEES.length > 0 ? (
                  <Button variant="secondary" className="flex-1" onClick={() => setMode("send")} disabled={sending}>
                    Send by HivePay
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
                            {p.voidedAt ? null : (
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
                <UploadRow label="Add a receipt or invoice" hint="Photos or PDFs, up to 25 MB each" accept={FILE_TYPES} multiple disabled={uploading !== null} progress={uploading} onFiles={addFiles} />
              </Card>
            </>
          )}

          <ErrorLine error={error} />

          {!e.automatic && !closed && livePayments.length === 0 && detail !== null ? (
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
  const [phone, setPhone] = useState("");
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const real = e.amountIsEstimate ? parseNumber(actual) : null;
  const value = parseNumber(amount || actual);
  const fee = value > 0 && Number.isInteger(value) ? hivepaySendFee(value) : null;
  const most = real ?? left;
  const problem = !(value > 0) ? null : value > most ? `That's more than the ${money(most)} left to pay.` : fee === null ? "That amount isn't on HivePay's price list. Pay in parts or another way." : null;
  const ready = value > 0 && fee !== null && !problem && phone.trim() !== "" && (!e.amountIsEstimate || real! > 0);

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
      <p className="text-sm font-semibold">Send by HivePay</p>
      {e.amountIsEstimate ? (
        <Field label="Real amount this time" hint={`Expected about ${money(e.amount)}.`}>
          <TextInput inputMode="numeric" value={actual} disabled={sure} onChange={(ev) => setActual(ev.target.value)} />
        </Field>
      ) : null}
      <Field label="They receive" hint={e.amountIsEstimate ? "Leave empty if it's the whole amount." : `${money(left)} left. Send less for a part payment.`}>
        <TextInput inputMode="numeric" value={amount} disabled={sure} onChange={(ev) => setAmount(ev.target.value)} />
      </Field>
      <Field label="MTN or Airtel number">
        <TextInput type="tel" value={phone} disabled={sure} onChange={(ev) => setPhone(ev.target.value)} placeholder="e.g. 0772 000 000" />
      </Field>
      {problem ? <p className="text-sm text-error-600 dark:text-error-400">{problem}</p> : null}
      {ready ? (
        <p className="text-sm text-muted">
          HivePay&apos;s fee is {money(fee)}, recorded as its own expense. {money(value + fee)} leaves the HivePay account.
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

function SchedulesList({ schedules }: { schedules: ExpenseSchedule[] }) {
  const money = useMoney();
  const router = useRouter();
  const [ending, setEnding] = useState<ExpenseSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!schedules.length) return <EmptyState>Nothing repeats yet. Record rent, salaries or electricity as a recurring expense.</EmptyState>;
  return (
    <>
      <ul className="grid gap-2 lg:grid-cols-2">
        {schedules.map((s) => (
          <li key={s.id} className="rounded-2xl border border-border bg-surface p-3 shadow-theme-xs">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-medium">{s.name}</p>
              <p className="shrink-0 font-semibold tnum">
                {s.varies ? "About " : ""}
                {money(s.amount)}
              </p>
            </div>
            <p className="mt-1 text-xs text-muted">{[EVERY_LABELS[s.every], s.categoryName, s.recipient, `From ${day(s.firstDueOn)}`, `By ${s.recordedBy}`].filter(Boolean).join(" · ")}</p>
            {s.endedAt ? (
              <p className="mt-2 text-xs text-muted">Ended by {s.endedBy}</p>
            ) : (
              <button type="button" className="mt-2 text-xs text-muted underline" onClick={() => setEnding(s)}>
                End it
              </button>
            )}
          </li>
        ))}
      </ul>
      {ending ? (
        <FormSheet open onClose={() => setEnding(null)} title={`End ${ending.name}?`}>
          <div className="space-y-3">
            <p className="text-sm text-muted">No more will be created. Any already created stay owed until they&apos;re paid or voided. To change the amount, end it and record a new one.</p>
            <ErrorLine error={error} />
            <Button
              variant="danger"
              className="w-full"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await endExpenseSchedule(ending.id);
                  if (!res.ok) return setError(res.error);
                  router.refresh();
                  setEnding(null);
                })
              }
            >
              End it
            </Button>
          </div>
        </FormSheet>
      ) : null}
    </>
  );
}
