"use client";

import Link from "next/link";

import type { WalletSummary } from "@repo/lib/wallet/types";

import { MoneyCard, cardTail } from "./MoneyCards";
import { useMoney } from "./shared";
import { clientPath } from "@repo/lib/client-portal/paths";

const WALLET_URL = clientPath("/payment");

// The client's Aming card at the top of their home screen, the same card as
// on their wallet page: the usual spot for a balance in wallet and banking
// apps (see apps/client/app/dashboard.tsx). The card opens the wallet; "Add
// funds" jumps straight to topping up.
export function WalletSummaryCard({ summary, client }: { summary: WalletSummary; client: { id: string; name: string } }) {
  const money = useMoney();
  return (
    <section aria-label="Wallet" className="space-y-2">
      <div className="relative">
        <MoneyCard face={{ card: "aming", name: "Aming card", holder: client.name, balance: summary.balance, tail: cardTail(client.id) }} />
        {/* Stretched link: the whole card opens the wallet. */}
        <Link href={WALLET_URL} className="absolute inset-0 rounded-[1.6rem]" aria-label="Open wallet" />
      </div>
      {summary.pendingCount ? <p className="text-xs text-muted">{money(summary.pendingAmount)} waiting for confirmation</p> : null}
      <Link
        href={`${WALLET_URL}?add=1`}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius)] bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
      >
        Add funds
      </Link>
    </section>
  );
}
