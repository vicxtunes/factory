"use client";

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { ExportButtons } from "@repo/ui/ExportButtons";
import { SectionLabel } from "@repo/ui/SectionLabel";
import type { BookAccount, BookChange, BookLine, EntryInput, PeriodTotals } from "@repo/lib/business-books/core";

import { AccountSheet } from "./AccountSheet";
import { EntrySheet, type EntryDraft } from "./EntrySheet";

/** Where a line came from, as the business reads it. */
const SOURCE: Record<string, string> = {
  invoice_payment: "Invoice receipt",
  system_customer_payment: "System payments",
  system_withdrawal: "Withdrawn to phone",
  system_withdrawal_returned: "Withdrawal returned",
  system_transfer_out: "To Aming card",
  system_transfer_in: "From Aming card",
  system_vendor_payment: "Vendor job",
  system_fee: "System payments fee",
  aming_card_deposit: "Aming card top-up",
  aming_card_order_payment: "Aming order",
  aming_card_refund: "Aming refund",
  aming_card_bonus: "Aming bonus",
  aming_card_adjustment: "Aming card",
};

export interface BooksBoardProps {
  currency: string;
  locale: string;
  today: string;
  accounts: BookAccount[];
  /** Every account's balance, by key, with its name ("System payments" …). */
  balances: { key: string; name: string; balance: number; own: boolean }[];
  /** The period's lines, newest first. */
  lines: BookLine[];
  totals: PeriodTotals;
  notes: string[];
  changes: Record<string, BookChange[]>;
  /** Hand entries as recorded, by id: what Edit opens with. */
  entries: Record<string, EntryInput>;
  employees: { id: string; name: string }[];
  projects: { id: string; title: string }[];
  periodLabel: string;
  canEdit: boolean;
  /** A reminder for the day, if any. */
  nudge: string | null;
}

export function BooksBoard(p: BooksBoardProps) {
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [account, setAccount] = useState<BookAccount | "new" | null>(null);
  const money = (n: number) => `${p.currency} ${Math.round(n).toLocaleString(p.locale)}`;
  const nameOf = new Map(p.balances.map((b) => [b.key, b.name]));
  const days = groupByDay(p.lines);
  const dayLabel = new Intl.DateTimeFormat(p.locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      {p.nudge && p.canEdit ? <p className="rounded-xl border border-warning-300 bg-warning-50 p-3 text-sm dark:border-warning-500/30 dark:bg-warning-500/10">{p.nudge}</p> : null}
      {p.canEdit ? (
        <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
          <Button type="button" onClick={() => setDraft({ id: null, kind: "in" })}>
            + Money in
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDraft({ id: null, kind: "out" })}>
            − Money out
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDraft({ id: null, kind: "move" })}>
            ⇄ Move
          </Button>
        </div>
      ) : null}

      <section>
        <SectionLabel>Where your money is</SectionLabel>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {p.balances.map((b) => (
            <li key={b.key}>
              <button
                type="button"
                disabled={!b.own || !p.canEdit}
                onClick={() => setAccount(p.accounts.find((a) => a.id === b.key) ?? null)}
                className="w-full rounded-2xl border border-border bg-surface p-4 text-left shadow-theme-xs enabled:hover:border-brand-300"
              >
                <span className="block truncate text-xs text-muted">{b.name}</span>
                <span className={`mt-1 block text-lg font-semibold tnum ${b.balance < 0 ? "text-error-600" : ""}`}>{money(b.balance)}</span>
              </button>
            </li>
          ))}
          {p.canEdit ? (
            <li>
              <button type="button" onClick={() => setAccount("new")} className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-border p-4 text-sm text-muted hover:border-brand-300">
                + Add an account
              </button>
            </li>
          ) : null}
        </ul>
        {p.balances.some((b) => b.balance < 0 && b.own) ? <p className="mt-2 text-xs text-error-600">A balance below zero usually means some money in wasn&apos;t recorded, or the opening balance is off.</p> : null}
      </section>

      <section>
        <SectionLabel>{p.periodLabel}</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Money in" value={money(p.totals.moneyIn)} />
          <Tile label="Money out" value={money(p.totals.moneyOut)} />
          <Tile label={p.totals.profit < 0 ? "Loss" : "Profit"} value={money(p.totals.profit)} tone={p.totals.profit < 0 ? "bad" : "good"} />
        </div>
        {p.notes.length ? (
          <ul className="mt-3 space-y-1 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-500/10">
            {p.notes.map((n) => (
              <li key={n}>💡 {n}</li>
            ))}
          </ul>
        ) : null}
        {p.totals.outByCategory.length ? (
          <div className="mt-4 space-y-1.5">
            <p className="text-xs font-medium text-muted">Money out by what it was for</p>
            {p.totals.outByCategory.map((c) => (
              <div key={c.category} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate">{c.category}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
                  <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, (c.amount / p.totals.moneyOut) * 100)}%` }} />
                </span>
                <span className="w-28 shrink-0 text-right tnum">{money(c.amount)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Every entry</SectionLabel>
          <ExportButtons
            filename={`books-${p.periodLabel.toLowerCase().replace(/\W+/g, "-")}`}
            columns={[
              { key: "day", label: "Day" },
              { key: "kind", label: "In / Out" },
              { key: "category", label: "For" },
              { key: "amount", label: "Amount" },
              { key: "account", label: "Account" },
              { key: "details", label: "Details" },
              { key: "by", label: "Recorded by" },
            ]}
            rows={p.lines.map((l) => ({
              day: l.occurredOn,
              kind: l.direction === "in" ? "In" : l.direction === "out" ? "Out" : "Move",
              category: l.category ?? "",
              amount: l.amount,
              account: l.direction === "move" ? `${nameOf.get(l.account) ?? ""} → ${nameOf.get(l.toAccount ?? "") ?? ""}` : (nameOf.get(l.account) ?? ""),
              details: [SOURCE[l.source], l.description].filter(Boolean).join(" · "),
              by: l.actorName ?? "",
            }))}
          />
        </div>
        {days.length ? (
          days.map(([day, lines]) => (
            <div key={day}>
              <p className="mb-1 text-xs font-medium text-muted">{dayLabel.format(new Date(`${day}T00:00:00Z`))}</p>
              <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
                {lines.map((l) => {
                  const editable = p.canEdit && l.source === "manual" && p.entries[l.sourceId];
                  const history = l.source === "manual" ? p.changes[l.sourceId] : undefined;
                  const edited = history?.some((c) => c.action === "edited");
                  return (
                    <li key={`${l.source}-${l.sourceId}`}>
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => editable && setDraft({ id: l.sourceId, ...p.entries[l.sourceId] })}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left enabled:hover:bg-background"
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${l.direction === "in" ? "bg-success-50 text-success-700 dark:bg-success-500/10" : l.direction === "out" ? "bg-error-50 text-error-700 dark:bg-error-500/10" : "bg-gray-100 text-gray-600 dark:bg-white/5"}`}>
                          {l.direction === "in" ? "+" : l.direction === "out" ? "−" : "⇄"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{l.direction === "move" ? `${nameOf.get(l.account) ?? "?"} → ${nameOf.get(l.toAccount ?? "") ?? "?"}` : (l.category ?? "")}</span>
                          <span className="block truncate text-xs text-muted">
                            {[l.source === "manual" ? null : SOURCE[l.source], l.direction === "move" ? null : nameOf.get(l.account), l.description, l.actorName ? `by ${l.actorName}${edited ? " (edited)" : ""}` : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className={`shrink-0 text-sm font-semibold tnum ${l.direction === "in" ? "text-success-700" : l.direction === "out" ? "" : "text-muted"}`}>
                          {l.direction === "out" ? "−" : l.direction === "in" ? "+" : ""}
                          {money(l.amount)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">Nothing recorded in this period yet.</p>
        )}
      </section>

      <EntrySheet draft={draft} onClose={() => setDraft(null)} accounts={p.accounts} employees={p.employees} projects={p.projects} today={p.today} />
      <AccountSheet account={account} onClose={() => setAccount(null)} today={p.today} />
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 shadow-theme-xs sm:p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-base font-semibold tnum sm:text-xl ${tone === "bad" ? "text-error-600" : tone === "good" ? "text-success-700" : ""}`}>{value}</p>
    </div>
  );
}

function groupByDay(lines: BookLine[]): [string, BookLine[]][] {
  const out = new Map<string, BookLine[]>();
  for (const l of lines) out.set(l.occurredOn, [...(out.get(l.occurredOn) ?? []), l]);
  return [...out];
}
