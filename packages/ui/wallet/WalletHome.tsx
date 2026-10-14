"use client";

// The top of a client's own wallet: their Aming card on the panel, Add
// funds, and the card's latest transactions. Their business's card, when
// they have one, is in the business's own Wallet (BusinessCardAnalytics).

import type { ReactNode } from "react";

import { ENTRY_LABELS, METHOD_LABELS } from "@repo/lib/wallet/policy";
import type { WalletEntry, WalletView } from "@repo/lib/wallet/types";

import { ActionPill, CardsPanel, Transactions, cardTail, type TransactionRow } from "./MoneyCards";

function amingRow(entry: WalletEntry): TransactionRow {
  const detail = [entry.orderNo ? `Order ${entry.orderNo}` : null, entry.method ? METHOD_LABELS[entry.method] : null, entry.note].filter(Boolean);
  return { id: entry.id, title: ENTRY_LABELS[entry.kind], detail: detail.join(" · ") || null, amount: entry.amount, createdAt: entry.createdAt };
}

export function WalletHome({
  wallet,
  owing,
  onAddFunds,
}: {
  wallet: WalletView;
  /** "You owe" and the unpaid invoices: under the card, above its transactions. */
  owing?: ReactNode;
  onAddFunds: () => void;
}) {
  return (
    <div className="space-y-4">
      <CardsPanel
        faces={[{ card: "aming", name: "Aming card", holder: wallet.clientName, balance: wallet.balance, tail: cardTail(wallet.clientId) }]}
        selected="aming"
        onSelect={() => {}}
        actions={
          <ActionPill icon="in" onClick={onAddFunds}>
            Add funds
          </ActionPill>
        }
      />
      {owing}
      <Transactions title="Latest Transactions" rows={wallet.entries.map(amingRow)} empty="No activity on your Aming card yet." />
    </div>
  );
}
