"use client";

// The pieces the wallet screens are built from (packages/lib/wallet/README.md
// → "Two cards"): the dashboard tiles the Wallet pages are laid out in, and a
// card's latest transactions.

import { useState, type ReactNode } from "react";

import { useMoney } from "./shared";
import { Button } from "@repo/ui/Button";

/** A tile on a Wallet page, laid out as a banking dashboard (design/ in the repo root). */
export const TILE = "rounded-3xl border border-border bg-surface p-5 shadow-theme-xs sm:p-6";

/** A tile's heading: a round icon, the title, and something small at the right. */
export function TileHead({ icon, title, aside }: { icon: ReactNode; title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border">
          {icon}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-medium ${className}`}>{children}</span>;
}

/** A tile's button: brand-filled, outlined, or pale on a brand-colored tile. */
export function Action({ variant, onClick, children }: { variant: "solid" | "outline" | "onBrand"; onClick: () => void; children: ReactNode }) {
  const look = {
    solid: "bg-brand-500 text-white hover:bg-brand-600",
    outline: "border border-border bg-surface hover:bg-background",
    onBrand: "bg-white/20 text-white hover:bg-white/30",
  }[variant];
  return (
    <button type="button" onClick={onClick} className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold ${look}`}>
      {children}
    </button>
  );
}

export interface TransactionRow {
  id: string;
  title: string;
  /** What it was for, before the date. */
  detail: string | null;
  /** Signed. */
  amount: number;
  createdAt: string;
}

/** "23 Jun", in the reader's own time zone. */
const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** How many a card shows before "See all". */
const LATEST = 5;

/** A card's transactions: the latest few, then all of them. `bare` sits on the panel, without a card of its own. */
export function Transactions({ title, rows, empty, bare = false }: { title?: string; rows: TransactionRow[]; empty: string; bare?: boolean }) {
  const money = useMoney();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, LATEST);
  return (
    <section className={bare ? "" : "rounded-[1.75rem] border border-border bg-surface p-5 shadow-theme-xs"}>
      <div className="flex items-center justify-between gap-3">
        {title ? <h3 className="text-base font-semibold">{title}</h3> : null}
        {rows.length > LATEST ? (
          <Button size="sm" variant="secondary" type="button" onClick={() => setAll(!all)}>
            {all ? "Show fewer" : "See all"}
          </Button>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {shown.map((row) => {
            const credit = row.amount > 0;
            return (
              <li key={row.id} className="flex items-center gap-3 py-3.5">
                <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={`h-4 w-4 ${credit ? "rotate-180" : ""}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7M9 7h8v8" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{row.title}</p>
                  <p className="flex text-xs text-muted">
                    {row.detail ? <span className="truncate">{row.detail}</span> : null}
                    {/* The server's time zone isn't the reader's. */}
                    <span suppressHydrationWarning className="shrink-0 whitespace-pre">
                      {row.detail ? " • " : ""}
                      {shortDay(row.createdAt)}
                    </span>
                  </p>
                </div>
                <p className={`shrink-0 text-[15px] font-semibold tabular-nums ${credit ? "text-success-600 dark:text-success-500" : ""}`}>
                  {credit ? "+ " : "– "}
                  {money(Math.abs(row.amount))}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
