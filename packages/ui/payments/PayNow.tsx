"use client";

import { useState } from "react";

import { Field, TextInput } from "@repo/ui/Field";
import { ChoiceGroup } from "@repo/ui/StepForm";
import { MobileMoneyPay } from "@repo/ui/wallet/MobileMoneyPay";
import { parseAmount } from "@repo/ui/wallet/shared";
import { parsePhone } from "@repo/lib/kernel/core/phone";
import { networkOfPhone, type MobileNetwork } from "@repo/lib/wallet/policy";
import type { MobileMoneyCollection, WalletResult } from "@repo/lib/wallet/types";
import { Button } from "@repo/ui/Button";

/**
 * Paying a studio by mobile money: in full or a deposit, by MTN or Airtel.
 * After booking or ordering it's optional (skip, and the quotation waits for
 * the studio to confirm); on a quotation or invoice it's the whole point.
 */
export function PayNow({
  total,
  format,
  phone,
  start,
  check,
  onPaid,
  onSkip,
}: {
  /** 0 when priced on request: then they type an amount. */
  total: number;
  format: (n: number) => string;
  /** Their number, when it's known (typed a step ago, or on file): it isn't asked for again unless they choose another. */
  phone: string | null;
  /** Sends the prompt for `amount` to `phone`. */
  start: (amount: number, phone: string) => Promise<WalletResult<MobileMoneyCollection>>;
  check: (id: string) => Promise<WalletResult<MobileMoneyCollection>>;
  onPaid: (amount: number) => void;
  /** "Skip, pay later", where paying is optional. */
  onSkip?: () => void;
}) {
  // However it was typed ("0772…", "+256 772…"), in the stored form; and its own network to start on.
  const parsed = phone ? parsePhone(phone) : null;
  const known = parsed?.ok ? parsed.store : null;
  const [network, setNetwork] = useState<MobileNetwork>(() => networkOfPhone(known) ?? "mtn");
  const [how, setHow] = useState<"full" | "deposit">("full");
  const [depositAmount, setDepositAmount] = useState("");
  const typed = total === 0 || how === "deposit";
  const amount = typed ? parseAmount(depositAmount) : total;

  return (
    <div className="space-y-3">
      {total > 0 ? (
        <ChoiceGroup
          label="How much"
          layout="tiles"
          value={how}
          onChange={setHow}
          options={[
            { value: "full", title: `Full · ${format(total)}` },
            { value: "deposit", title: "Deposit" },
          ]}
        />
      ) : null}
      {typed ? (
        <Field label={total > 0 ? "Deposit" : "Amount"}>
          <TextInput inputMode="numeric" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="e.g. 20000" />
        </Field>
      ) : null}
      <ChoiceGroup
        label="Pay with"
        layout="tiles"
        value={network}
        onChange={setNetwork}
        options={[
          { value: "mtn", title: "MTN" },
          { value: "airtel", title: "Airtel" },
        ]}
      />
      <MobileMoneyPay key={network} amount={amount} network={network} knownPhone={known} start={(p) => start(amount, p)} check={check} onDone={() => onPaid(amount)} />
      {onSkip ? (
        <Button size="sm" variant="secondary" type="button" onClick={onSkip} className="w-full">
          Skip, pay later
        </Button>
      ) : null}
    </div>
  );
}
