"use client";

// A business's Wallet page: its card (beside the owner's Aming card, for the
// owner, who also transfers and withdraws from here), then money in and out
// over the last months and the card's history, on the same panels as the
// wallet's cards (light or dark with the theme).

import { area, curveMonotoneX, line } from "d3-shape";
import { scaleLinear } from "d3-scale";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BUSINESS_ENTRY_LABELS } from "@repo/lib/wallet/policy";
import type { BusinessCardEntry, BusinessCardMonth, BusinessCardView, CardName } from "@repo/lib/wallet/types";

import { TransferSheet, WithdrawSheet, Withdrawals } from "./CardSheets";
import { ActionPill, BigMoney, CardsPanel, PANEL, Transactions, cardTail, type CardFace, type TransactionRow } from "./MoneyCards";
import { useMoney } from "./shared";

type View = "all" | "income" | "outcome";
const VIEWS: { key: View; label: string }[] = [
  { key: "all", label: "All" },
  { key: "income", label: "Income" },
  { key: "outcome", label: "Outcome" },
];

// The chart's two colors, from the theme, a step apart in each mode so they
// hold against a light surface and a dark one: money in wears the brand
// color, money out a neutral gray (and a dashed line, so it's never told
// apart by color alone).
const CHART_COLORS =
  "[--money-in:var(--color-brand-500)] [--money-out:var(--color-gray-500)] dark:[--money-in:var(--color-brand-400)] dark:[--money-out:var(--color-gray-400)]";
const IN = "var(--money-in)";
const OUT = "var(--money-out)";

function businessRow(entry: BusinessCardEntry): TransactionRow {
  // A customer's payment is named for who paid.
  const paid = entry.kind === "customer_payment";
  return { id: entry.id, title: paid ? entry.actorName : BUSINESS_ENTRY_LABELS[entry.kind], detail: entry.note, amount: entry.amount, createdAt: entry.createdAt };
}

const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" });

/** Where the lines sit in the plot's 0–100 box: clear of the value bubble above, off the floor below. */
const TOP = 30;
const FLOOR = 92;

/** Money in and out by month, as smooth lines. Pointing at a month names its figures. */
function MonthsChart({ months, view }: { months: BusinessCardMonth[]; view: View }) {
  const money = useMoney();
  const [active, setActive] = useState(months.length - 1);
  const showIncome = view !== "outcome";
  const showOutcome = view !== "income";

  // One point in the middle of each month's column, plus one at each edge so the lines run the panel's full width.
  const n = months.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = scaleLinear()
    .domain([0, Math.max(1, ...months.flatMap((m) => [showIncome ? m.income : 0, showOutcome ? m.outcome : 0]))])
    .range([FLOOR, TOP]);
  const points = (of: (m: BusinessCardMonth) => number): [number, number][] => [
    [0, y(of(months[0]))],
    ...months.map((m, i): [number, number] => [x(i), y(of(m))]),
    [100, y(of(months[n - 1]))],
  ];
  // Monotone: smooth, and never dips below a month's own value.
  const curve = line().curve(curveMonotoneX);
  const fill = area().y0(100).curve(curveMonotoneX);
  const income = points((m) => m.income);
  const outcome = points((m) => m.outcome);

  const at = months[active];
  // The marker rides the line the view is about: money in, unless only money out shows.
  const marked = showIncome ? at.income : at.outcome;
  const color = showIncome ? IN : OUT;
  const left = `${x(active)}%`;
  const top = `${y(marked)}%`;

  return (
    <figure className="-mx-5 mt-4 sm:-mx-6">
      <div className="relative h-44">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="card-income-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={IN} stopOpacity="0.28" />
              <stop offset="1" stopColor={IN} stopOpacity="0" />
            </linearGradient>
          </defs>
          {showIncome ? <path d={fill(income) ?? undefined} fill="url(#card-income-fill)" /> : null}
          {showOutcome ? <path d={curve(outcome) ?? undefined} fill="none" stroke={OUT} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
          {showIncome ? <path d={curve(income) ?? undefined} fill="none" stroke={IN} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-9 -translate-x-1/2 opacity-20 transition-[left] duration-200"
          style={{ left, backgroundImage: `linear-gradient(to bottom, transparent, ${color}, transparent)` }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface transition-[left,top] duration-200 dark:border-gray-950"
          style={{ left, top, backgroundColor: color }}
        />
        <span
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+0.9rem)] whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold text-white transition-[left,top] duration-200 dark:text-gray-950"
          style={{ left: `clamp(3.5rem, ${left}, calc(100% - 3.5rem))`, top, backgroundColor: color }}
        >
          {money(marked)}
        </span>
        <div className="absolute inset-0 flex">
          {months.map((m, i) => (
            <button
              key={m.month}
              type="button"
              aria-label={`${monthName(m.month)}: ${money(m.income)} in, ${money(m.outcome)} out`}
              aria-pressed={i === active}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className="h-full flex-1 focus-visible:bg-foreground/5 focus-visible:outline-none"
            />
          ))}
        </div>
      </div>
      <div aria-hidden className="mt-2 flex text-sm">
        {months.map((m, i) => (
          <span key={m.month} className={`flex-1 text-center ${i === active ? "font-semibold text-brand-600 dark:text-brand-400" : "text-muted"}`}>
            {monthName(m.month)}
          </span>
        ))}
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-5 text-xs text-muted sm:px-6">
        {showIncome ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ backgroundColor: IN }} />
            Money in
          </span>
        ) : null}
        {showOutcome ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="w-4 border-t-2 border-dashed" style={{ borderColor: OUT }} />
            Money out
          </span>
        ) : null}
        <span className="ml-auto tabular-nums text-foreground">
          {monthName(at.month)}: {money(at.income)} in · {money(at.outcome)} out
        </span>
      </figcaption>
    </figure>
  );
}

function Tile({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <div className="rounded-3xl bg-gray-50 p-4 dark:bg-white/[0.07]">
      <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full text-white dark:text-gray-950" style={{ backgroundColor: color }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.5h18M5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9A2.5 2.5 0 0 1 5.5 5Z" />
        </svg>
      </span>
      <BigMoney amount={amount} className="mt-4 text-xl" />
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

/** "+12.5% ↑ Income was up on last month", when there's a last month to compare with. */
function Change({ months }: { months: BusinessCardMonth[] }) {
  const now = months[months.length - 1].income;
  const before = months[months.length - 2]?.income ?? 0;
  if (before <= 0) return null;
  const change = ((now - before) / before) * 100;
  const up = change >= 0;
  return (
    <div className="mt-3 rounded-3xl bg-brand-100 px-5 py-4 text-brand-950">
      <p className="text-2xl font-semibold tabular-nums">
        {up ? "+" : "−"}
        {Math.abs(change).toFixed(1)}% <span aria-hidden>{up ? "↑" : "↓"}</span>
      </p>
      <p className="text-sm font-medium">Income was {up ? "up" : "down"} on last month</p>
    </div>
  );
}

export function BusinessCardAnalytics({
  business,
  card,
  owner,
}: {
  business: { id: string; name: string };
  card: BusinessCardView;
  /** The owner looking at it: their Aming card sits beside the business's, and they can move money. */
  owner?: { clientId: string; name: string; amingBalance: number; phone: string | null };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<CardName>("business");
  const [view, setView] = useState<View>("all");
  const [sheet, setSheet] = useState<"transfer" | "withdraw" | null>(null);
  const income = card.months.reduce((sum, m) => sum + m.income, 0);
  const outcome = card.months.reduce((sum, m) => sum + m.outcome, 0);
  const rows = card.entries.filter((e) => view === "all" || (view === "income" ? e.amount > 0 : e.amount < 0)).map(businessRow);

  const faces: CardFace[] = [
    { card: "business", name: "Business card", holder: business.name, balance: card.balance, tail: cardTail(business.id) },
    ...(owner ? [{ card: "aming" as const, name: "Aming card", holder: owner.name, balance: owner.amingBalance, tail: cardTail(owner.clientId) }] : []),
  ];

  return (
    <div className="space-y-4">
      <CardsPanel
        faces={faces}
        selected={selected}
        onSelect={setSelected}
        actions={
          owner ? (
            <>
              <ActionPill icon="out" onClick={() => setSheet("transfer")}>
                Transfer
              </ActionPill>
              {selected === "business" ? (
                <ActionPill icon="in" onClick={() => setSheet("withdraw")}>
                  Withdraw
                </ActionPill>
              ) : (
                // Adding funds is on the owner's own wallet page.
                <ActionPill icon="in" onClick={() => router.push("/payment?add=1")}>
                  Add funds
                </ActionPill>
              )}
            </>
          ) : null
        }
      />
      <section aria-label="Business card, month by month" className={`${PANEL} ${CHART_COLORS}`}>
        <div role="tablist" aria-label="What to show" className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              className={`h-11 rounded-full px-5 text-sm font-medium ${
                view === v.key ? "bg-brand-500 text-white" : "bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <MonthsChart months={card.months} view={view} />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Tile label={`Total income, ${card.months.length} months`} amount={income} color={IN} />
          <Tile label={`Total outcome, ${card.months.length} months`} amount={outcome} color={OUT} />
        </div>
        <Change months={card.months} />
        <div className="mt-6">
          <Transactions
            key={view}
            bare
            title="Transactions History"
            rows={rows}
            empty={view === "all" ? "Nothing yet. What your customers pay you in the app lands here." : "Nothing here yet."}
          />
        </div>
        <table className="sr-only">
          <caption>Money in and out by month</caption>
          <thead>
            <tr>
              <th>Month</th>
              <th>In</th>
              <th>Out</th>
            </tr>
          </thead>
          <tbody>
            {card.months.map((m) => (
              <tr key={m.month}>
                <td>{m.month}</td>
                <td>{m.income}</td>
                <td>{m.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {owner ? (
        <>
          <Withdrawals withdrawals={card.withdrawals} />
          {/* Opens going the other way from the chosen card: money leaves the one being looked at. */}
          <TransferSheet
            key={`transfer-${selected}`}
            open={sheet === "transfer"}
            onClose={() => setSheet(null)}
            to={selected === "business" ? "aming" : "business"}
            balances={{ business: card.balance, aming: owner.amingBalance }}
          />
          <WithdrawSheet open={sheet === "withdraw"} onClose={() => setSheet(null)} balance={card.balance} phone={owner.phone} />
        </>
      ) : null}
    </div>
  );
}
