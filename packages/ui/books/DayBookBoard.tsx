"use client";

// Accounts → Today: one day's money. Opening + in − out = closing for each
// account, every line behind it, and closing the day with a count. Tiles stack
// on a phone and sit side by side on a desktop; lines are cards on a phone and
// a table from md. Any day can be opened, so past days can be traced.

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { ExportButtons } from "@repo/ui/ExportButtons";
import { Field, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { Card, EmptyState, FigureTile, formatDayTime, useMoney } from "@repo/ui/accounting/shared";
import { parseNumber } from "@repo/ui/production/sheets";
import { closeDay, setOpeningBalances } from "@repo/lib/books/actions";
import { DAY_LINE_LABELS, dayTotals, type DayAccount, type DayBook, type DayLine } from "@repo/lib/books/model";

const METHODS: Record<string, string> = { cash: "Cash", mobile_money: "Mobile money", bank_transfer: "Bank transfer", card: "Card", other: "Other" };

/** A calendar day moved by some days, in plain date arithmetic so no zone can shift it. */
function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

function dayName(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${day}T00:00:00Z`));
}

/** What a line was for, unless its label already says so. */
const forWhat = (l: DayLine) => (l.detail && l.detail !== DAY_LINE_LABELS[l.kind] ? l.detail : null);

/** Who a line is with: the client, and who really sent it when that's someone else. */
function who(l: DayLine): string {
  return [l.party, l.senderName && l.senderName !== l.party ? `sent by ${l.senderName}` : null].filter(Boolean).join(", ");
}

function matches(l: DayLine, query: string, accountName: string): boolean {
  if (!query) return true;
  return [l.party, l.senderName ?? "", l.phone ?? "", l.reference ?? "", l.detail ?? "", l.recordedBy ?? "", METHODS[l.method] ?? l.method, accountName, DAY_LINE_LABELS[l.kind]].some((f) =>
    f.toLowerCase().includes(query),
  );
}

export function DayBookBoard({ book, timeZone }: { book: DayBook; timeZone: string }) {
  const money = useMoney();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<"opening" | "close" | null>(null);
  const query = search.trim().toLowerCase();
  const accountName = useMemo(() => new Map(book.accounts.map((a) => [a.id, a.name])), [book.accounts]);
  const nameOf = (l: DayLine) => (l.accountId ? accountName.get(l.accountId) ?? "" : "No account");

  const visible = book.lines.filter((l) => matches(l, query, nameOf(l)));
  const totals = dayTotals(visible);
  const allTotals = dayTotals(book.lines);
  const late = book.lines.filter((l) => l.late);
  const unset = book.accounts.filter((a) => a.opening === null);
  const isToday = book.day === book.today;
  // Only days after the last close can be closed, and only once every account has a balance.
  const canClose = !book.close && unset.length === 0 && (book.lastClosedDay === null || book.day > book.lastClosedDay);
  const open = (day: string) => router.push(day === book.today ? "?" : `?day=${day}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => open(shiftDay(book.day, -1))}>
          Previous day
        </Button>
        <div className="w-40">
          <TextInput type="date" aria-label="Open a day" value={book.day} max={book.today} onChange={(e) => e.target.value && open(e.target.value)} />
        </div>
        <Button size="sm" variant="secondary" disabled={isToday} onClick={() => open(shiftDay(book.day, 1))}>
          Next day
        </Button>
        {isToday ? null : (
          <Button size="sm" variant="secondary" onClick={() => open(book.today)}>
            Today
          </Button>
        )}
        <p className="basis-full text-sm font-semibold sm:ml-auto sm:basis-auto">{dayName(book.day)}</p>
      </div>

      {unset.length && isToday ? (
        <Card
          title="Start the books"
          aside={
            <Button size="sm" onClick={() => setSheet("opening")}>
              Enter opening balances
            </Button>
          }
        >
          <p className="text-sm text-muted">
            Count what&apos;s really in {unset.map((a) => a.name.toLowerCase()).join(", ")} now. Balances run from that count. Until then, this page shows the day&apos;s money but no balances.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {book.accounts.map((a) => (
          <AccountTile key={a.id} account={a} />
        ))}
        <FigureTile label="Net for the day" value={money(allTotals.net)} hint={`${money(allTotals.moneyIn)} in · ${money(allTotals.moneyOut)} out`} />
      </div>

      {allTotals.inNoAccount > 0 ? (
        <p className="rounded-2xl border border-warning-500/40 p-3 text-sm text-warning-700 dark:text-warning-500">
          {money(allTotals.inNoAccount)} was recorded with the method &ldquo;Other&rdquo; and no account, so it isn&apos;t in any balance above.
        </p>
      ) : null}

      {book.close ? (
        <Card title="Day closed">
          <p className="text-sm">
            Closed by {book.close.closedBy} on {formatDayTime(book.close.closedAt, timeZone)}. It can&apos;t be changed.
          </p>
          {book.accounts.some((a) => a.difference) ? (
            <ul className="mt-2 divide-y divide-border text-sm">
              {book.accounts
                .filter((a) => a.difference)
                .map((a) => (
                  <li key={a.id} className="flex justify-between gap-2 py-1.5">
                    <span>{a.name}: counted {money(a.counted ?? 0)}</span>
                    <span className="font-semibold tnum text-warning-700 dark:text-warning-500">
                      {a.difference! > 0 ? "Over " : "Short "}
                      {money(Math.abs(a.difference!))}
                    </span>
                  </li>
                ))}
            </ul>
          ) : null}
          {book.close.note ? <p className="mt-2 text-sm text-muted">{book.close.note}</p> : null}
          {late.length ? (
            <p className="mt-2 text-sm text-warning-700 dark:text-warning-500">
              {late.length} line{late.length === 1 ? "" : "s"} came after closing ({money(late.reduce((sum, l) => sum + l.amount, 0))}). They aren&apos;t in the count and carry into the next day&apos;s opening.
            </p>
          ) : null}
        </Card>
      ) : canClose ? (
        <Button onClick={() => setSheet("close")}>Close {isToday ? "today" : "this day"}</Button>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-auto sm:min-w-0 sm:flex-1">
          <TextInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, reference, account or staff…"
            aria-label="Search the day's money"
          />
        </div>
        <ExportButtons
          filename={`money-${book.day}`}
          rows={visible.map((l) => ({
            when: formatDayTime(l.at, timeZone),
            direction: l.direction === "in" ? "In" : "Out",
            what: DAY_LINE_LABELS[l.kind],
            who: who(l),
            phone: l.phone ?? "",
            detail: l.detail ?? "",
            amount: l.amount,
            method: METHODS[l.method] ?? l.method,
            account: nameOf(l),
            reference: l.reference ?? "",
            recordedBy: l.recordedBy ?? "",
          }))}
          columns={[
            { key: "when", label: "When" },
            { key: "direction", label: "In or out" },
            { key: "what", label: "What" },
            { key: "who", label: "Who" },
            { key: "phone", label: "Phone" },
            { key: "detail", label: "For" },
            { key: "amount", label: "Amount" },
            { key: "method", label: "Method" },
            { key: "account", label: "Account" },
            { key: "reference", label: "Reference" },
            { key: "recordedBy", label: "Recorded by" },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState>{query ? `Nothing matches “${search.trim()}”.` : "No money came in or went out on this day."}</EmptyState>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {visible.map((l) => (
              <li key={`${l.kind}-${l.id}`} className="rounded-2xl border border-border bg-surface p-3 shadow-theme-xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-medium">{who(l)}</p>
                  <SignedAmount line={l} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {formatDayTime(l.at, timeZone)} · {DAY_LINE_LABELS[l.kind]}
                  {forWhat(l) ? ` · ${forWhat(l)}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {METHODS[l.method] === nameOf(l) ? nameOf(l) : `${METHODS[l.method] ?? l.method} · ${nameOf(l)}`}
                  {l.phone ? ` · ${l.phone}` : ""}
                  {l.reference ? ` · ${l.reference}` : ""}
                  {l.recordedBy ? ` · By ${l.recordedBy}` : ""}
                </p>
                {l.late ? <LateTag /> : null}
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-theme-xs md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Who</th>
                  <th className="px-4 py-2 font-medium">What</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Recorded by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((l) => (
                  <tr key={`${l.kind}-${l.id}`}>
                    <td className="whitespace-nowrap px-4 py-2 tnum">
                      {formatDayTime(l.at, timeZone)}
                      {l.late ? <LateTag /> : null}
                    </td>
                    <td className="px-4 py-2 font-medium">{who(l)}</td>
                    <td className="px-4 py-2 text-muted">
                      {DAY_LINE_LABELS[l.kind]}
                      {forWhat(l) ? <span className="block text-xs">{forWhat(l)}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      <SignedAmount line={l} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{nameOf(l)}</td>
                    <td className="px-4 py-2 text-muted tnum">
                      {METHODS[l.method] ?? l.method}
                      {l.phone || l.reference ? <span className="block text-xs">{[l.phone, l.reference].filter(Boolean).join(" · ")}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{l.recordedBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <td className="px-4 py-2" colSpan={3}>
                    {money(totals.moneyIn)} in · {money(totals.moneyOut)} out
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tnum">{money(totals.net)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {sheet === "opening" ? <OpeningSheet accounts={unset} onClose={() => setSheet(null)} /> : null}
      {sheet === "close" ? <CloseSheet book={book} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

function SignedAmount({ line }: { line: DayLine }) {
  const money = useMoney();
  return (
    <span className={`shrink-0 font-semibold tnum ${line.direction === "in" ? "text-success-700 dark:text-success-500" : ""}`}>
      {line.direction === "in" ? "+" : "−"}
      {money(line.amount)}
    </span>
  );
}

function LateTag() {
  return <span className="mt-1 block text-xs font-medium text-warning-700 dark:text-warning-500">After closing</span>;
}

function AccountTile({ account: a }: { account: DayAccount }) {
  const money = useMoney();
  const rows: [string, string][] = [
    ...(a.opening === null ? [] : ([["Opening", money(a.opening)]] as [string, string][])),
    ["Money in", `+${money(a.moneyIn)}`],
    ["Money out", `−${money(a.moneyOut)}`],
    ...(a.difference ? ([[a.difference > 0 ? "Over at count" : "Short at count", money(Math.abs(a.difference))]] as [string, string][]) : []),
  ];
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <p className="text-sm text-muted">{a.name}</p>
      <p className="mt-1 truncate text-2xl font-bold tnum">{a.closing === null ? "Not counted yet" : money(a.closing)}</p>
      <dl className="mt-2 space-y-0.5 text-xs text-muted">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt>{label}</dt>
            <dd className="tnum">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function OpeningSheet({ accounts, onClose }: { accounts: DayAccount[]; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (accounts.some((a) => !values[a.id]?.trim())) return setError("Enter a balance for every account. Enter 0 if it's empty.");
    setError(null);
    start(async () => {
      const res = await setOpeningBalances({ counts: accounts.map((a) => ({ accountId: a.id, amount: parseNumber(values[a.id]) })) });
      if (!res.ok) return setError(res.error);
      onClose();
    });
  }

  return (
    <FormSheet open onClose={onClose} title="Opening balances">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">What&apos;s really there at the start of today, before today&apos;s money. This is set once; a later mistake shows up as a difference when a day is closed.</p>
        {accounts.map((a) => (
          <Field key={a.id} label={a.name}>
            <TextInput inputMode="numeric" value={values[a.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))} />
          </Field>
        ))}
        {error ? <p className="text-xs text-error-600">{error}</p> : null}
        <Button type="submit" loading={pending} className="w-full">
          Save opening balances
        </Button>
      </form>
    </FormSheet>
  );
}

function CloseSheet({ book, onClose }: { book: DayBook; onClose: () => void }) {
  const money = useMoney();
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const counted = (a: DayAccount) => (values[a.id]?.trim() ? parseNumber(values[a.id]) : null);
  const differs = book.accounts.some((a) => {
    const c = counted(a);
    return c !== null && c !== a.expected;
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (book.accounts.some((a) => a.kind === "cash" && counted(a) === null)) return setError("Enter the cash you counted.");
    if (differs && !note.trim()) return setError("Say why the count is different from what's expected.");
    setError(null);
    start(async () => {
      const res = await closeDay({ day: book.day, counts: book.accounts.map((a) => ({ accountId: a.id, counted: counted(a) })), note });
      if (!res.ok) return setError(res.error);
      onClose();
    });
  }

  return (
    <FormSheet open onClose={onClose} title={`Close ${dayName(book.day)}`}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">A closed day can&apos;t be changed. Count the cash; add bank and mobile money if you can see their balances.</p>
        {book.accounts.map((a) => {
          const c = counted(a);
          const difference = c === null || a.expected === null ? null : c - a.expected;
          return (
            <Field key={a.id} label={`${a.name}: should be ${money(a.expected ?? 0)}`}>
              <TextInput
                inputMode="numeric"
                aria-label={`${a.name} counted`}
                placeholder={a.kind === "cash" ? "Counted" : "Counted (optional)"}
                value={values[a.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))}
              />
              {difference ? (
                <p className="mt-1 text-xs font-medium text-warning-700 dark:text-warning-500">
                  {difference > 0 ? "Over by " : "Short by "}
                  {money(Math.abs(difference))}
                </p>
              ) : null}
            </Field>
          );
        })}
        <Field label={differs ? "Why is it different?" : "Note (optional)"}>
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        {error ? <p className="text-xs text-error-600">{error}</p> : null}
        <Button type="submit" loading={pending} className="w-full">
          Close the day
        </Button>
      </form>
    </FormSheet>
  );
}
