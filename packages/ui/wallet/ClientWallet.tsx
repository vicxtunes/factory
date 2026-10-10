"use client";

import { useRef, useState } from "react";

import { Button } from "@repo/ui/Button";
import { PaymentMethods } from "@repo/ui/payments/PaymentMethods";
import type { WalletView } from "@repo/lib/wallet/types";

import { BalanceCard, EntryLine, Panel, PaymentLine } from "./shared";

// The client's wallet: balance first, then "Add funds" — MTN / Airtel right
// here (a prompt on their phone), or the bank details (staff add a bank
// transfer once they see it on the statement) — then any older deposit
// reports still waiting for confirmation, and the full history.
//
// Layout: one column on phones and tablets. From `lg` up it becomes a
// two-column grid — balance + history on the left, the "add funds" flow and
// pending deposits in a narrower rail on the right.
//
// The left column has a hard 20rem floor. If the page shell is narrower than
// 20rem + 22rem + gap, the grid will overflow rather than crush the balance
// card — which is the honest signal that the shell needs to be widened.
// See the page file: the wrapper must be `max-w-5xl` or wider for this to
// look right on desktop.
export function ClientWallet({
  wallet,
  startAdding = false,
}: {
  wallet: WalletView;
  /** Open "Add funds" straight away (the home screen's Add funds button links here with ?add=1). */
  startAdding?: boolean;
}) {
  const addRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(startAdding || (wallet.entries.length === 0 && wallet.pending.length === 0));

  const hasPending = wallet.pending.length > 0;
  const hasClosed = wallet.closed.length > 0;
  const showAside = adding || hasPending;

  function openAdd() {
    setAdding(true);
    requestAnimationFrame(() => addRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(20rem,2fr)_22rem] lg:items-start lg:gap-6">
      {/* Left column — `contents` on phones flattens this so its sections
          join the outer stack as siblings; from lg up it's a real column. */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
        <div className="order-1 space-y-4">
          <BalanceCard balance={wallet.balance}>
            <Button onClick={openAdd}>Add funds</Button>
          </BalanceCard>
          <p className="text-xs text-muted">
            Pay for any order from your balance: open the order and tap{" "}
            <span className="font-medium">Pay from wallet</span>.
          </p>
        </div>

        <div className="order-4">
          <Panel title="History">
            {wallet.entries.length ? (
              <ul className="divide-y divide-border">
                {wallet.entries.map((e) => (
                  <EntryLine key={e.id} entry={e} />
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-muted">No wallet activity yet.</p>
            )}
          </Panel>
        </div>

        {hasClosed ? (
          <div className="order-5">
            <Panel title="Not confirmed">
              <ul className="divide-y divide-border">
                {wallet.closed.map((p) => (
                  <PaymentLine key={p.id} payment={p} />
                ))}
              </ul>
            </Panel>
          </div>
        ) : null}
      </div>

      {/* Right rail — same `contents` trick, ordered so phones still read
          balance → add funds → waiting → history. */}
      {showAside ? (
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {adding ? (
            <div ref={addRef} className="order-2 scroll-mt-4 space-y-3">
              <Panel title="Add funds">
                <PaymentMethods
                  pay="top-up"
                  bankExtra={
                    <p className="text-xs text-muted">
                      We add bank transfers to your wallet once we see them on our statement.
                    </p>
                  }
                />
              </Panel>
            </div>
          ) : null}

          {hasPending ? (
            <div className="order-3">
              <Panel title="Waiting for confirmation">
                <p className="text-xs text-muted">
                  We&apos;ll add these to your balance once we&apos;ve seen the money arrive.
                </p>
                <ul className="divide-y divide-border">
                  {wallet.pending.map((p) => (
                    <PaymentLine key={p.id} payment={p} />
                  ))}
                </ul>
              </Panel>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

