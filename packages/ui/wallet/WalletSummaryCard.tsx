"use client";

import Link from "next/link";

import type { WalletSummary } from "@repo/lib/wallet/types";

import { Pill } from "./MoneyCards";
import { useMoney } from "./shared";
import { clientPath } from "@repo/lib/client-portal/paths";

const WALLET_URL = clientPath("/payment");

// The client's Aming card on their home screen, a brand-colored tile like the
// one on their Wallet page (see apps/client/app/dashboard.tsx). The tile opens
// the wallet; "Add funds" jumps straight to topping up.
export function WalletSummaryCard({ summary }: { summary: WalletSummary }) {
  const money = useMoney();
  return (
    <section aria-label="Wallet" className="relative h-full overflow-hidden rounded-3xl bg-brand-500 p-5 text-white shadow-theme-xs">
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10" />
      <div className="relative flex items-center justify-between gap-2">
        <Pill className="border-white/40">Aming card</Pill>
        <Link href={WALLET_URL} className="text-xs font-medium text-white/80 hover:text-white hover:underline">
          Open wallet
        </Link>
      </div>
      <p className="relative mt-6 text-sm text-white/80">Balance</p>
      <p className="relative mt-1 truncate text-3xl font-bold tracking-tight tabular-nums">{money(summary.balance)}</p>
      <p className="relative mt-1 min-h-4 text-xs text-white/80">{summary.pendingCount ? `${money(summary.pendingAmount)} waiting for confirmation` : null}</p>
      <Link
        href={`${WALLET_URL}?add=1`}
        className="relative mt-5 inline-flex h-11 items-center justify-center rounded-full bg-white/20 px-5 text-sm font-semibold hover:bg-white/30"
      >
        Add funds
      </Link>
    </section>
  );
}
