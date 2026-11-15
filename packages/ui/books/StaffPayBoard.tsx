"use client";

// Accounts → Staff pay (owner, 2026-11-15): salaries, allowances and advances
// for everyone Aming pays. The boss only. Tabs: what's to pay now, the
// people (a grid of cards on a desktop, stacked on a phone), every payslip,
// and advances. Every add and edit opens in a FormSheet. A payslip's pay is
// an expense, so it's paid with the same forms as a bill.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { DataTable, type DataTableColumn } from "@repo/ui/DataTable";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { Tabs } from "@repo/ui/Tabs";
import { Card, EmptyState, FigureTile } from "@repo/ui/accounting/shared";
import { PayFields, PayForm, SendForm, usePayFields } from "@repo/ui/books/ExpensesBoard";
import { ErrorLine, Form, parseNumber, useMoney, useSubmit } from "@repo/ui/production/sheets";
import {
  addStaffPayExtra,
  giveStaffAdvance,
  removeStaffPayExtra,
  saveStaffPayPerson,
  setStaffPayDays,
  setStaffPaySettings,
  stopStaffPayPerson,
} from "@repo/lib/books/actions";
import { WEEKDAYS, expenseBalance } from "@repo/lib/books/expenses";
import {
  SLIP_STATE_LABELS,
  advanceState,
  payDayLabel,
  rateUnit,
  slipGross,
  slipOpen,
  slipState,
  type PayEvery,
  type PayLine,
  type SlipState,
  type StaffAdvance,
  type StaffPayCandidate,
  type StaffPayPerson,
  type StaffPaySettings,
  type StaffPaySlip,
} from "@repo/lib/books/staff-pay";
import { localPhone } from "@repo/lib/wallet/policy";

type Tab = "to_pay" | "people" | "payslips" | "advances";

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));

const STATE_STYLES: Record<SlipState, string> = {
  needs_days: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  to_pay: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300",
  sending: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500",
  paid: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
  nothing_to_pay: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300",
  cancelled: "bg-gray-100 text-gray-500 line-through dark:bg-white/5",
};

const ADVANCE_LABELS = { paid: "Given", sending: "Being sent", not_sent: "Not delivered", cancelled: "Cancelled" } as const;

function StateBadge({ state }: { state: SlipState }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLES[state]}`}>{SLIP_STATE_LABELS[state]}</span>;
}

export function StaffPayBoard({
  people,
  slips,
  advances,
  candidates,
  settings,
  today,
}: {
  people: StaffPayPerson[];
  slips: StaffPaySlip[];
  advances: StaffAdvance[];
  candidates: StaffPayCandidate[];
  settings: StaffPaySettings;
  today: string;
}) {
  const money = useMoney();
  const active = people.filter((p) => !p.stopped);
  const open = slips.filter(slipOpen).sort((a, b) => a.payOn.localeCompare(b.payOn));
  const [tab, setTab] = useState<Tab>(open.length > 0 ? "to_pay" : "people");
  const [editing, setEditing] = useState<StaffPayPerson | "new" | null>(null);
  const [extraFor, setExtraFor] = useState<StaffPayPerson | null>(null);
  const [advanceFor, setAdvanceFor] = useState<StaffPayPerson | "pick" | null>(null);
  const [slipId, setSlipId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const personOf = new Map(people.map((p) => [p.id, p]));
  const slip = slips.find((s) => s.id === slipId) ?? null;

  const dueNow = open.filter((s) => s.payOn <= today && s.expense).reduce((sum, s) => sum + expenseBalance(s.expense!), 0);
  const nextOn = active.map((p) => p.nextPayOn).sort()[0] ?? null;
  const nextTotal = active
    .filter((p) => p.nextPayOn === nextOn && !p.dayRate)
    .reduce((sum, p) => sum + p.rate + p.allowances.reduce((a, x) => a + x.amount, 0) + p.extras.reduce((a, x) => a + x.amount, 0), 0);
  const owed = active.reduce((sum, p) => sum + p.advanceOwed, 0);

  const slipColumns: DataTableColumn<StaffPaySlip>[] = [
    { key: "name", header: "Person", render: (s) => <span className="font-medium">{personOf.get(s.personId)?.name ?? "—"}</span> },
    { key: "pay_on", header: "Pay day", sortable: true, sortValue: (s) => s.payOn, render: (s) => day(s.payOn) },
    { key: "gross", header: "Pay", align: "right", render: (s) => (s.net === null ? "—" : money(slipGross(s))) },
    { key: "advance", header: "Advance off", align: "right", render: (s) => (s.advance > 0 ? `−${money(s.advance)}` : "—") },
    { key: "net", header: "They get", align: "right", render: (s) => <span className="font-semibold tnum">{s.net === null ? "—" : money(s.net)}</span> },
    { key: "state", header: "", render: (s) => <StateBadge state={slipState(s)} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FigureTile label="To pay now" value={money(dueNow)} hint={`${open.filter((s) => s.payOn <= today).length} payslips due`} tone={dueNow > 0 ? "warning" : undefined} />
        <FigureTile label="Next pay day" value={nextOn ? day(nextOn) : "—"} hint={nextOn ? `About ${money(nextTotal)} before advances` : "Nobody's paid yet"} />
        <FigureTile label="Advances to take off" value={money(owed)} hint="Off the next payslips" />
        <button type="button" onClick={() => setSettingsOpen(true)} className="rounded-2xl border border-border bg-surface p-4 text-left shadow-theme-xs">
          <p className="text-sm text-muted">Sends by itself</p>
          <p className="mt-1 text-2xl font-bold">{settings.sendsOn ? `On, ${settings.sendAt}` : "Off"}</p>
          <p className="mt-1 text-xs text-muted underline">Change</p>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          label="Staff pay"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "to_pay", label: "To pay", count: open.length, tone: "warning" },
            { key: "people", label: "People", count: active.length },
            { key: "payslips", label: "Payslips" },
            { key: "advances", label: "Advances" },
          ]}
        />
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setAdvanceFor("pick")} disabled={active.length === 0}>
            Give an advance
          </Button>
          <Button size="sm" onClick={() => setEditing("new")}>
            Add a person
          </Button>
        </div>
      </div>

      {tab === "to_pay" ? (
        open.length === 0 ? (
          <EmptyState>Nothing to pay. Payslips are made on each person&apos;s pay day.</EmptyState>
        ) : (
          <SlipList slips={open} columns={slipColumns} personOf={personOf} onOpen={setSlipId} />
        )
      ) : null}

      {tab === "people" ? (
        active.length === 0 ? (
          <EmptyState>Nobody is on staff pay yet. Add the people Aming pays.</EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((p) => (
              <PersonCard key={p.id} person={p} onEdit={() => setEditing(p)} onExtra={() => setExtraFor(p)} onAdvance={() => setAdvanceFor(p)} />
            ))}
          </div>
        )
      ) : null}

      {tab === "payslips" ? (
        slips.length === 0 ? <EmptyState>No payslips yet.</EmptyState> : <SlipList slips={slips} columns={slipColumns} personOf={personOf} onOpen={setSlipId} />
      ) : null}

      {tab === "advances" ? <AdvanceList advances={advances} personOf={personOf} /> : null}

      {editing ? <PersonSheet person={editing === "new" ? null : editing} candidates={candidates} onClose={() => setEditing(null)} /> : null}
      {extraFor ? <ExtraSheet person={extraFor} onClose={() => setExtraFor(null)} /> : null}
      {advanceFor ? <AdvanceSheet person={advanceFor === "pick" ? null : advanceFor} people={active} today={today} onClose={() => setAdvanceFor(null)} /> : null}
      {slip ? <SlipSheet slip={slip} person={personOf.get(slip.personId) ?? null} today={today} onClose={() => setSlipId(null)} /> : null}
      {settingsOpen ? <SettingsSheet settings={settings} onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}

function SlipList({
  slips,
  columns,
  personOf,
  onOpen,
}: {
  slips: StaffPaySlip[];
  columns: DataTableColumn<StaffPaySlip>[];
  personOf: Map<string, StaffPayPerson>;
  onOpen: (id: string) => void;
}) {
  const money = useMoney();
  return (
    <>
      <ul className="space-y-2 md:hidden">
        {slips.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onOpen(s.id)} className="flex w-full items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-3 text-left shadow-theme-xs">
              <div className="min-w-0">
                <p className="truncate font-medium">{personOf.get(s.personId)?.name ?? "—"}</p>
                <p className="mt-0.5 text-xs text-muted">{day(s.payOn)}</p>
                <div className="mt-1.5">
                  <StateBadge state={slipState(s)} />
                </div>
              </div>
              <span className="shrink-0 font-semibold tnum">{s.net === null ? "—" : money(s.net)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <DataTable columns={columns} rows={slips} rowKey={(s) => s.id} onRowClick={(s) => onOpen(s.id)} />
      </div>
    </>
  );
}

function PersonCard({ person: p, onEdit, onExtra, onAdvance }: { person: StaffPayPerson; onEdit: () => void; onExtra: () => void; onAdvance: () => void }) {
  const money = useMoney();
  const allowances = p.allowances.reduce((sum, a) => sum + a.amount, 0);
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{p.name}</h2>
          <p className="truncate text-xs text-muted">{p.roles.length ? p.roles.join(" · ") : "Not in the app"}</p>
        </div>
        {p.sendsItself ? (
          <span className="shrink-0 rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700 dark:bg-success-500/15 dark:text-success-500">Sends by itself</span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-bold tnum">
        {money(p.rate)} <span className="text-sm font-normal text-muted">{rateUnit(p)}</span>
      </p>
      <dl className="mt-2 space-y-1 text-xs text-muted">
        <div>
          Paid {p.dayRate ? (p.payEvery === "week" ? "weekly, " : "monthly, ") : ""}
          {payDayLabel(p.payEvery, p.payDay)}. Next {day(p.nextPayOn)}.
        </div>
        {allowances > 0 ? <div>Allowances {money(allowances)} ({p.allowances.map((a) => a.name).join(", ")})</div> : null}
        {p.extras.length > 0 ? <div>Next pay also: {p.extras.map((x) => `${x.name} ${money(x.amount)}`).join(", ")}</div> : null}
        {p.advanceOwed > 0 ? <div className="text-warning-700 dark:text-warning-500">Advance {money(p.advanceOwed)} comes off the next pay</div> : null}
        <div>{p.phone ? `Phone ${localPhone(p.phone)}` : "No phone for mobile money"}</div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="secondary" onClick={onExtra}>
          Add to next pay
        </Button>
        <Button size="sm" variant="secondary" onClick={onAdvance}>
          Advance
        </Button>
      </div>
    </section>
  );
}

function AdvanceList({ advances, personOf }: { advances: StaffAdvance[]; personOf: Map<string, StaffPayPerson> }) {
  const money = useMoney();
  if (advances.length === 0) return <EmptyState>No advances given.</EmptyState>;
  return (
    <Card title="Advances">
      <ul className="divide-y divide-border text-sm">
        {advances.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="font-medium">{personOf.get(a.personId)?.name ?? "—"}</p>
              <p className="mt-0.5 text-xs text-muted">
                {day(a.givenOn)} · {ADVANCE_LABELS[advanceState(a)]}
                {a.expense?.paidFrom.length ? ` · from ${a.expense.paidFrom.join(", ")}` : ""}
              </p>
            </div>
            <span className="shrink-0 font-semibold tnum">{money(a.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">An advance comes off the next payslip. What that payslip can&apos;t cover comes off the one after.</p>
    </Card>
  );
}

// --- Sheets ----------------------------------------------------------------------

type PayKind = "month" | "week" | "day";

function PersonSheet({ person: p, candidates, onClose }: { person: StaffPayPerson | null; candidates: StaffPayCandidate[]; onClose: () => void }) {
  const [id] = useState(() => p?.id ?? crypto.randomUUID());
  const [who, setWho] = useState("");
  const [name, setName] = useState(p?.name ?? "");
  const [kind, setKind] = useState<PayKind>(p ? (p.dayRate ? "day" : p.payEvery) : "month");
  const [every, setEvery] = useState<PayEvery>(p?.payEvery ?? "month");
  const [rate, setRate] = useState(p ? String(p.rate) : "");
  const [payDay, setPayDay] = useState(String(p?.payDay ?? 28));
  const [phone, setPhone] = useState(p?.phone ? localPhone(p.phone) : "");
  const [sendsItself, setSendsItself] = useState(p?.sendsItself ?? false);
  const [allowances, setAllowances] = useState<{ name: string; amount: string }[]>(p?.allowances.map((a) => ({ name: a.name, amount: String(a.amount) })) ?? []);
  const [stopping, setStopping] = useState(false);
  const { error, pending, submit, setError } = useSubmit(onClose);
  const payEvery: PayEvery = kind === "day" ? every : kind;
  const chosen = candidates.find((c) => `${c.kind}:${c.id}` === who);

  function save() {
    const value = parseNumber(rate);
    if (!Number.isInteger(value) || value <= 0) return setError("Enter the pay in whole shillings.");
    const lines: PayLine[] = [];
    for (const a of allowances) {
      if (!a.name.trim() && !a.amount.trim()) continue;
      const amount = parseNumber(a.amount);
      if (!a.name.trim() || !Number.isInteger(amount) || amount <= 0) return setError("Give each allowance a name and an amount.");
      lines.push({ name: a.name.trim(), amount });
    }
    const link = (k: StaffPayCandidate["kind"]) => (p ? ({ worker: p.workerId, profile: p.profileId, designer: p.designerId }[k] ?? null) : chosen?.kind === k ? chosen.id : null);
    submit(() =>
      saveStaffPayPerson({
        id,
        name: name.trim() || chosen?.name || "",
        workerId: link("worker"),
        profileId: link("profile"),
        designerId: link("designer"),
        payEvery,
        dayRate: kind === "day",
        rate: value,
        payDay: Number(payDay),
        phone,
        sendsItself,
        allowances: lines,
      }),
    );
  }

  // Changing between monthly and weekly needs a pay day of that kind.
  function changeEvery(next: PayEvery) {
    if (next !== payEvery) setPayDay(next === "week" ? "5" : "28");
  }

  return (
    <FormSheet open onClose={onClose} title={p ? `Pay for ${p.name}` : "Add a person"} size="lg">
      <Form onSubmit={save}>
        {p ? null : (
          <Field label="Who" hint="Workers, office staff and designers in the app. Pick 'Someone else' for a person who isn't.">
            <Select
              value={who}
              onChange={(e) => {
                setWho(e.target.value);
                const c = candidates.find((x) => `${x.kind}:${x.id}` === e.target.value);
                if (c) setName(c.name);
              }}
            >
              <option value="">Someone else</option>
              {candidates.map((c) => (
                <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>
                  {c.name} ({c.detail})
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Paid">
            <Select
              value={kind}
              onChange={(e) => {
                const next = e.target.value as PayKind;
                setKind(next);
                changeEvery(next === "day" ? every : next);
              }}
            >
              <option value="month">A monthly salary</option>
              <option value="week">A weekly wage</option>
              <option value="day">By the day</option>
            </Select>
          </Field>
          <Field label={kind === "day" ? "Pay for one day" : kind === "week" ? "Pay for a week" : "Pay for a month"}>
            <TextInput inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} required />
          </Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {kind === "day" ? (
            <Field label="Paid every" hint="You enter the days worked on each payslip.">
              <Select
                value={every}
                onChange={(e) => {
                  setEvery(e.target.value as PayEvery);
                  changeEvery(e.target.value as PayEvery);
                }}
              >
                <option value="month">Month</option>
                <option value="week">Week</option>
              </Select>
            </Field>
          ) : null}
          <Field label="Pay day" hint={p ? "A new pay day starts after the last payslip." : undefined}>
            <Select value={payDay} onChange={(e) => setPayDay(e.target.value)}>
              {payEvery === "week"
                ? WEEKDAYS.map((w, i) => (
                    <option key={w} value={i}>
                      {w}
                    </option>
                  ))
                : Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                      {d >= 29 ? " (or the last day)" : ""}
                    </option>
                  ))}
            </Select>
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Allowances with every pay</p>
          {allowances.map((a, i) => (
            <div key={i} className="flex gap-2">
              <TextInput
                value={a.name}
                onChange={(e) => setAllowances((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                placeholder="e.g. Transport"
                maxLength={80}
                aria-label="Allowance"
              />
              <TextInput
                inputMode="numeric"
                value={a.amount}
                onChange={(e) => setAllowances((all) => all.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                placeholder="Amount"
                aria-label="Amount"
                className="w-32"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => setAllowances((all) => all.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={() => setAllowances((all) => [...all, { name: "", amount: "" }])}>
            Add an allowance
          </Button>
        </div>

        <Field label="MTN or Airtel number for their pay" hint="Leave empty to pay them in cash.">
          <TextInput type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0772 000 000" maxLength={30} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={sendsItself} onChange={(e) => setSendsItself(e.target.checked)} />
          <span>
            Send their pay by itself on pay day
            <span className="block text-xs text-muted">
              Through HivePay, at the time set under Sends by itself, with no warning first. You hear only if it fails. Aming pays HivePay&apos;s charge. Pay by the day waits until you enter the days.
            </span>
          </span>
        </label>
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          {p ? "Save" : "Add"}
        </Button>
        {p ? (
          stopping ? (
            <div className="space-y-2 rounded-xl bg-warning-50 p-3 dark:bg-warning-500/10">
              <p className="text-sm">Stop paying {p.name}? No more payslips are made. Those already made stay, to pay.</p>
              <div className="flex gap-2">
                <Button type="button" variant="danger" loading={pending} onClick={() => submit(() => stopStaffPayPerson(p.id))}>
                  Stop their pay
                </Button>
                <Button type="button" variant="secondary" onClick={() => setStopping(false)}>
                  Keep
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="ghost" className="w-full" onClick={() => setStopping(true)}>
              Stop paying {p.name}
            </Button>
          )
        ) : null}
      </Form>
    </FormSheet>
  );
}

function ExtraSheet({ person: p, onClose }: { person: StaffPayPerson; onClose: () => void }) {
  const money = useMoney();
  const router = useRouter();
  const [id] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const { error, pending, submit, setError } = useSubmit(onClose);
  const [removing, setRemoving] = useState<string | null>(null);

  return (
    <FormSheet open onClose={onClose} title={`Add to ${p.name}'s next pay`}>
      <Form
        onSubmit={() => {
          const value = parseNumber(amount);
          if (!Number.isInteger(value) || value <= 0) return setError("Enter the amount in whole shillings.");
          submit(() => addStaffPayExtra({ id, personId: p.id, name, amount: value }));
        }}
      >
        <p className="text-xs text-muted">Only on the next payslip, {day(p.nextPayOn)}: a bonus, overtime, a one-off allowance.</p>
        {p.extras.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {p.extras.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  {x.name} · {money(x.amount)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  loading={removing === x.id}
                  onClick={async () => {
                    setRemoving(x.id);
                    const res = await removeStaffPayExtra(x.id);
                    setRemoving(null);
                    if (!res.ok) return setError(res.error);
                    onClose();
                    router.refresh();
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <Field label="What for">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Overtime" maxLength={80} required />
        </Field>
        <Field label="Amount">
          <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          Add to next pay
        </Button>
      </Form>
    </FormSheet>
  );
}

function AdvanceSheet({ person, people, today, onClose }: { person: StaffPayPerson | null; people: StaffPayPerson[]; today: string; onClose: () => void }) {
  const money = useMoney();
  const [id] = useState(() => crypto.randomUUID());
  const [personId, setPersonId] = useState(person?.id ?? "");
  const p = people.find((x) => x.id === personId) ?? null;
  const [amount, setAmount] = useState("");
  const [send, setSend] = useState(false);
  const [phone, setPhone] = useState(person?.phone ? localPhone(person.phone) : "");
  const [sure, setSure] = useState(false);
  const pay = usePayFields(today);
  const { error, pending, submit, setError } = useSubmit(onClose);
  const value = parseNumber(amount);

  function go() {
    if (!p) return setError("Choose who gets the advance.");
    if (!Number.isInteger(value) || value <= 0) return setError("Enter the advance in whole shillings.");
    if (send && (value < 500 || value > 5_000_000)) return setError("HivePay sends from 500 to 5,000,000 at a time.");
    if (send && !sure) return setSure(true);
    submit(() =>
      giveStaffAdvance({
        id,
        personId: p.id,
        amount: value,
        givenOn: send ? today : pay.value.paidOn,
        send,
        accountId: send ? null : pay.value.accountId || null,
        method: send ? "mobile_money" : pay.value.method,
        reference: send ? null : pay.value.reference,
        phone: send ? phone : null,
      }),
    );
  }

  return (
    <FormSheet open onClose={onClose} title={p ? `Advance for ${p.name}` : "Give an advance"}>
      <Form onSubmit={go}>
        {person ? null : (
          <Field label="Who">
            <Select
              value={personId}
              onChange={(e) => {
                setPersonId(e.target.value);
                const next = people.find((x) => x.id === e.target.value);
                setPhone(next?.phone ? localPhone(next.phone) : "");
              }}
              required
            >
              <option value="">Choose</option>
              {people.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <p className="text-xs text-muted">
          It comes off {p ? `${p.name}'s` : "their"} next payslip{p ? `, ${day(p.nextPayOn)}` : ""}. It&apos;s recorded as a Salary advances expense.
          {p && p.advanceOwed > 0 ? ` ${money(p.advanceOwed)} from earlier advances still comes off too.` : ""}
        </p>
        <Field label="Amount">
          <TextInput inputMode="numeric" value={amount} disabled={sure} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="How">
          <Select value={send ? "send" : "paid"} disabled={sure} onChange={(e) => setSend(e.target.value === "send")}>
            <option value="paid">Already paid (cash, mobile money, bank)</option>
            <option value="send">Send it now by HivePay</option>
          </Select>
        </Field>
        {send ? (
          <>
            <Field label="MTN or Airtel number">
              <TextInput type="tel" value={phone} disabled={sure} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0772 000 000" required />
            </Field>
            <p className="text-xs text-muted">The phone receives the full amount. Aming pays HivePay&apos;s charge on top, recorded as a HivePay sending fee expense.</p>
          </>
        ) : (
          <PayFields form={pay} />
        )}
        <ErrorLine error={error} />
        {sure ? (
          <div className="space-y-2 rounded-xl bg-warning-50 p-3 dark:bg-warning-500/10">
            <p className="text-sm font-medium">
              Send {money(value)} to {phone.trim()}? Real money leaves at once and can&apos;t be pulled back.
            </p>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" loading={pending} disabled={pending}>
                Yes, send {money(value)}
              </Button>
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setSure(false)}>
                Change
              </Button>
            </div>
          </div>
        ) : (
          <Button type="submit" className="w-full" loading={pending} disabled={pending}>
            {send ? "Continue" : "Record advance"}
          </Button>
        )}
      </Form>
    </FormSheet>
  );
}

function SlipSheet({ slip: s, person, today, onClose }: { slip: StaffPaySlip; person: StaffPayPerson | null; today: string; onClose: () => void }) {
  const money = useMoney();
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "pay" | "send">("view");
  const [days, setDays] = useState("");
  const { error, pending, submit, setError } = useSubmit(() => undefined);
  const state = slipState(s);
  const refresh = async () => router.refresh();
  const e = s.expense;

  return (
    <FormSheet open onClose={onClose} title={`${person?.name ?? "Payslip"}, ${day(s.payOn)}`}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <StateBadge state={state} />
          {s.movedFromBill ? <span className="text-xs text-muted">Moved from Expenses</span> : null}
        </div>
        <dl className="divide-y divide-border rounded-xl border border-border text-sm">
          <Line label={s.dayRate ? `Basic: ${s.days ?? "?"} days × ${money(s.rate)}` : "Basic"} value={s.basic === null ? "—" : money(s.basic)} />
          {s.allowances.map((a, i) => (
            <Line key={i} label={a.once ? `${a.name} (this pay only)` : a.name} value={money(a.amount)} />
          ))}
          {s.advance > 0 ? <Line label="Advance taken off" value={`−${money(s.advance)}`} /> : null}
          <Line label="They get" value={s.net === null ? "—" : money(s.net)} strong />
          {e && e.paid > 0 ? <Line label="Paid so far" value={money(e.paid)} /> : null}
        </dl>
        {e?.paidFrom.length ? <p className="text-xs text-muted">Paid from {e.paidFrom.join(", ")}.</p> : null}

        {state === "needs_days" ? (
          <Form
            onSubmit={() => {
              const value = parseNumber(days);
              if (!(value >= 0)) return setError("Enter the days worked.");
              submit(() => setStaffPayDays({ slipId: s.id, days: value }));
            }}
          >
            <Field label="Days worked" hint="Half days are fine, e.g. 5.5.">
              <TextInput inputMode="decimal" value={days} onChange={(ev) => setDays(ev.target.value)} required />
            </Field>
            <ErrorLine error={error} />
            <Button type="submit" className="w-full" loading={pending} disabled={pending}>
              Work out the pay
            </Button>
          </Form>
        ) : null}

        {state === "to_pay" && e ? (
          mode === "pay" ? (
            <PayForm expense={e} today={today} onDone={refresh} onCancel={onClose} />
          ) : mode === "send" ? (
            <SendForm expense={{ ...e, payPhone: e.payPhone ?? person?.phone ?? null }} onDone={refresh} onCancel={onClose} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button className="flex-1" onClick={() => setMode("send")}>
                Send by mobile money
              </Button>
              <Button className="flex-1" variant="secondary" onClick={() => setMode("pay")}>
                Record it as paid
              </Button>
            </div>
          )
        ) : null}
        {state === "sending" ? <p className="text-sm text-muted">HivePay is sending it. It shows as paid once HivePay says it arrived.</p> : null}
        {state === "to_pay" && e && expenseBalance(e) > 0 && s.payOn > today ? <p className="text-xs text-muted">Due on {day(s.payOn)}. You can pay it early.</p> : null}
      </div>
    </FormSheet>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 px-3 py-2 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}

function SettingsSheet({ settings, onClose }: { settings: StaffPaySettings; onClose: () => void }) {
  const [sendsOn, setSendsOn] = useState(settings.sendsOn);
  const [sendAt, setSendAt] = useState(settings.sendAt);
  const { error, pending, submit } = useSubmit(onClose);
  return (
    <FormSheet open onClose={onClose} title="Pay that sends by itself">
      <Form onSubmit={() => submit(() => setStaffPaySettings({ sendsOn, sendAt }))}>
        <p className="text-xs text-muted">
          When this is on, the pay of everyone set to send by itself goes through HivePay on their pay day, at this time, with no warning first. You get a message only if one fails; it then waits under To pay.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sendsOn} onChange={(e) => setSendsOn(e.target.checked)} />
          Send pay by itself
        </label>
        <Field label="At">
          <Select value={sendAt} onChange={(e) => setSendAt(e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => `${String(i + 9).padStart(2, "0")}:00`).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          Save
        </Button>
      </Form>
    </FormSheet>
  );
}
