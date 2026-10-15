"use client";

// A business's Wallet page, laid out as a banking dashboard like the client's
// own (design/ in the repo root): the Business card, drawn as a bank card
// (./BankCard.tsx), beside the owner's Aming card for the owner (who moves money onto it, one way, and
// withdraws from here),
// then three tiles: what came in against what went out, money in month by
// month, and the card's latest transactions.

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccountsIcon, HistoryIcon, PaymentIcon } from "@repo/ui/icons";
import { BUSINESS_ENTRY_LABELS } from "@repo/lib/wallet/policy";
import type { BusinessCardEntry, BusinessCardMonth, BusinessCardView, WalletCard } from "@repo/lib/wallet/types";

import { BankCard } from "./BankCard";
import { TransferSheet, WithdrawSheet, Withdrawals } from "./CardSheets";
import { Action, Pill, TILE, TileHead, Transactions, type TransactionRow } from "./MoneyCards";
import { useMoney } from "./shared";

function businessRow(entry: BusinessCardEntry): TransactionRow {
  // A customer's payment is named for who paid.
  const paid = entry.kind === "customer_payment";
  return { id: entry.id, title: paid ? entry.actorName : BUSINESS_ENTRY_LABELS[entry.kind], detail: entry.note, amount: entry.amount, createdAt: entry.createdAt };
}

const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleString("en", { month: "long", timeZone: "UTC" });

/** Money leaving the card: an arrow up out of a tray. */
function WithdrawIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5" />
      <path d="M3.75 14.25v4.5A2.25 2.25 0 0 0 6 21h12a2.25 2.25 0 0 0 2.25-2.25v-4.5" />
    </svg>
  );
}

/** From one card to the other: two arrows passing. */
function TransferIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5" />
      <path d="M16.5 3 21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

/** "+12% vs last month", green or red; nothing without a last month to compare with. */
function Change({ now, before, label }: { now: number; before: number; label: string }) {
  if (before <= 0) return null;
  const change = Math.round(((now - before) / before) * 100);
  return (
    <p className="text-xs text-muted">
      <span className={`font-semibold ${change >= 0 ? "text-success-600 dark:text-success-500" : "text-error-600 dark:text-error-500"}`}>
        {change >= 0 ? "+" : "−"}
        {Math.abs(change)}%
      </span>{" "}
      {label}
    </p>
  );
}

/** What came in against what went out over the months shown: a ring, what's left in its middle. */
function InAndOut({ income, outcome, span }: { income: number; outcome: number; span: string }) {
  const money = useMoney();
  const total = income + outcome;
  // A ring of circumference 100, so a share is its own dash length.
  const r = 100 / (2 * Math.PI);
  const share = total > 0 ? (income / total) * 100 : 0;
  const gap = income > 0 && outcome > 0 ? 1.5 : 0;
  const kept = income - outcome;
  return (
    <section className={TILE}>
      <TileHead icon={<PaymentIcon className="h-5 w-5" />} title="In and out" aside={<Pill className="border-border">{span}</Pill>} />
      <div className="relative mx-auto mt-6 aspect-square w-full max-w-[13rem]">
        <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3.2" className="stroke-gray-100 dark:stroke-white/10" />
          {outcome > 0 ? (
            <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3.2" strokeLinecap="round" className="stroke-gray-400" strokeDasharray={`${Math.max(0, 100 - share - 2 * gap)} 100`} strokeDashoffset={-(share + gap)} />
          ) : null}
          {income > 0 ? <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3.2" strokeLinecap="round" className="stroke-brand-500" strokeDasharray={`${share} 100`} /> : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p className="max-w-full truncate text-xl font-bold tnum sm:text-2xl">{money(Math.abs(kept))}</p>
          <p className="mt-0.5 text-xs text-muted">{kept >= 0 ? "Kept" : "More out than in"}</p>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div className="min-w-0">
          <dt className="flex items-center gap-2 text-xs text-muted">
            <span aria-hidden className="h-2 w-2 rounded-full bg-brand-500" />
            Money in
          </dt>
          <dd className="mt-1 truncate font-semibold tnum">{money(income)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-2 text-xs text-muted">
            <span aria-hidden className="h-2 w-2 rounded-full bg-gray-400" />
            Money out
          </dt>
          <dd className="mt-1 truncate font-semibold tnum">{money(outcome)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Money in this month, then each month's beside a bar, the latest first. */
function MoneyIn({ months }: { months: BusinessCardMonth[] }) {
  const money = useMoney();
  const now = months[months.length - 1];
  const before = months[months.length - 2];
  const top = Math.max(1, ...months.map((m) => m.income));
  return (
    <section className={TILE}>
      <TileHead icon={<AccountsIcon className="h-5 w-5" />} title="Money in" aside={<Pill className="border-border">{monthName(now.month)}</Pill>} />
      <p className="mt-6 truncate text-3xl font-bold tnum sm:text-4xl">{money(now.income)}</p>
      <div className="mt-1 min-h-4">
        <Change now={now.income} before={before?.income ?? 0} label="vs last month" />
      </div>
      <ul className="mt-5 space-y-3.5">
        {[...months].reverse().map((m) => {
          const current = m === now;
          return (
            <li key={m.month}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className={current ? "font-semibold" : "text-muted"}>{monthName(m.month)}</span>
                <span className={`tnum ${current ? "font-semibold" : "text-muted"}`}>{money(m.income)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                <div className={`h-full rounded-full ${current ? "bg-brand-500" : "bg-gray-300 dark:bg-white/25"}`} style={{ width: `${(m.income / top) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BusinessCardAnalytics({
  studioName,
  card,
  owner,
}: {
  /** The name on the Business card. */
  studioName: string;
  card: BusinessCardView;
  /** The owner looking at it: their Aming card sits beside the business's, and they can move money. */
  owner?: { name: string; aming: { balance: number; card: WalletCard }; phone: string | null };
}) {
  const router = useRouter();
  const money = useMoney();
  const [sheet, setSheet] = useState<"transfer" | "withdraw" | null>(null);
  const income = card.months.reduce((sum, m) => sum + m.income, 0);
  const outcome = card.months.reduce((sum, m) => sum + m.outcome, 0);
  const span = `${card.months.length} month${card.months.length === 1 ? "" : "s"}`;
  const now = card.months[card.months.length - 1];
  const before = card.months[card.months.length - 2];

  return (
    <div className="space-y-4">
      <div className={`grid gap-4 ${owner ? "md:grid-cols-2" : "md:max-w-md"}`}>
        <div className="space-y-3">
          <BankCard
            label="Business card"
            holder={studioName}
            balance={money(card.balance)}
            card={card.card}
            tone="dark"
            // Only reached with the wallet PIN entered.
            startHidden={false}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {owner ? (
              <div className="flex flex-wrap gap-2">
                <Action variant="solid" onClick={() => setSheet("withdraw")}>
                  <WithdrawIcon />
                  Withdraw
                </Action>
                <Action variant="outline" onClick={() => setSheet("transfer")}>
                  <TransferIcon />
                  Move to Aming card
                </Action>
              </div>
            ) : null}
            <Change now={now.income} before={before?.income ?? 0} label="money in vs last month" />
          </div>
        </div>

        {owner ? (
          <BankCard
            label="Aming card"
            holder={owner.name}
            balance={money(owner.aming.balance)}
            card={owner.aming.card}
            tone="brand"
            // Adding funds is on the owner's own wallet page.
            onAdd={() => router.push("/payment?add=1")}
            addLabel="Add funds"
          />
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <InAndOut income={income} outcome={outcome} span={span} />
        <MoneyIn months={card.months} />
        <section className={`${TILE} min-w-0 md:col-span-2 lg:col-span-1`}>
          <TileHead icon={<HistoryIcon className="h-5 w-5" />} title="Transactions" />
          <div className="mt-3">
            <Transactions bare rows={card.entries.map(businessRow)} empty="Nothing yet. What your customers pay you in the app lands here." />
          </div>
        </section>
      </div>

      {owner ? (
        <>
          <Withdrawals withdrawals={card.withdrawals} />
          <TransferSheet open={sheet === "transfer"} onClose={() => setSheet(null)} balance={card.balance} />
          <WithdrawSheet open={sheet === "withdraw"} onClose={() => setSheet(null)} balance={card.balance} phone={owner.phone} />
        </>
      ) : null}
    </div>
  );
}
