"use client";

// Where money recorded by hand came from and where it went: the same fields on
// an invoice payment, a wallet deposit and other money in.

import { useEffect, useState } from "react";

import { Field, Select, TextInput } from "@repo/ui/Field";
import { listMoneyAccounts } from "@repo/lib/wallet/actions";
import { accountKindFor } from "@repo/lib/wallet/policy";
import type { MoneyAccount, MoneySource, PaymentMethod } from "@repo/lib/wallet/types";

/** Today where the person is; the server re-checks against the business's date. */
export function todayHere(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** The fields' state. `senderName` starts as who the money is expected from, when that's known. */
export function useMoneySource(method: PaymentMethod, senderName = "") {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [source, setSource] = useState({ senderName, senderPhone: "", receivedOn: todayHere() });
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMoneyAccounts().then((res) => {
      if (cancelled) return;
      if (res.ok) setAccounts(res.data ?? []);
      else setLoadError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Follows the method until someone picks an account themselves.
  const accountId = chosen ?? accounts.find((a) => a.kind === accountKindFor(method))?.id ?? "";
  const value: MoneySource = { ...source, accountId };
  return { value, accounts, loadError, setChosen, update: (patch: Partial<typeof source>) => setSource((s) => ({ ...s, ...patch })) };
}

export function MoneySourceFields({ form, method }: { form: ReturnType<typeof useMoneySource>; method: PaymentMethod }) {
  const { value, accounts, loadError, setChosen, update } = form;
  return (
    <>
      <Field label="Who sent it">
        <TextInput value={value.senderName} onChange={(e) => update({ senderName: e.target.value })} maxLength={120} autoComplete="off" />
      </Field>
      {method === "cash" ? null : (
        <Field label={method === "mobile_money" ? "Phone it came from" : "Phone (optional)"}>
          <TextInput inputMode="tel" value={value.senderPhone ?? ""} onChange={(e) => update({ senderPhone: e.target.value })} maxLength={30} autoComplete="off" />
        </Field>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Day it arrived">
          <TextInput type="date" value={value.receivedOn} max={todayHere()} onChange={(e) => update({ receivedOn: e.target.value })} />
        </Field>
        <Field label="Went into">
          <Select value={value.accountId} onChange={(e) => setChosen(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {loadError ? <p className="text-xs text-error-600">{loadError}</p> : null}
    </>
  );
}
