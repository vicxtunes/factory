"use client";

// Money in that isn't from a client: owners' money, other income, money
// borrowed. Under Accounts → Payments, kept apart from client payments so it
// never counts as sales money. Cards on a phone, rows that widen on a desktop.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { CHANNEL_LABELS, Card, useMoney } from "@repo/ui/accounting/shared";
import { VoidSheet, parseNumber } from "@repo/ui/production/sheets";
import { MoneySourceFields, todayHere, useMoneySource } from "@repo/ui/wallet/MoneySourceFields";
import { recordOtherMoney, voidOtherMoney } from "@repo/lib/books/actions";
import { OTHER_MONEY_LABELS, type OtherMoneyKind, type OtherMoneyLine } from "@repo/lib/books/model";
import { METHOD_LABELS, checkMoneySource } from "@repo/lib/wallet/policy";
import type { PaymentMethod } from "@repo/lib/wallet/types";

const METHODS: PaymentMethod[] = ["cash", "mobile_money", "bank_transfer", "other"];
const KINDS: OtherMoneyKind[] = ["owner", "other_income", "other"];

export function OtherMoneyPanel({ lines }: { lines: OtherMoneyLine[] }) {
  const money = useMoney();
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<OtherMoneyLine | null>(null);
  const total = lines.reduce((sum, l) => sum + l.amount, 0);

  return (
    <Card
      title="Other money in"
      aside={
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          Record money in
        </Button>
      }
    >
      <p className="text-xs text-muted">Money that isn&apos;t from a client: owners&apos; money, other income, money borrowed. It isn&apos;t counted as sales money.</p>
      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-muted">None in this period.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-border text-sm">
            {lines.map((l) => (
              <li key={`${l.kind}-${l.id}`} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {l.senderName} <span className="text-xs font-normal text-muted">· {OTHER_MONEY_LABELS[l.kind]}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {l.receivedOn} · {CHANNEL_LABELS[l.method as keyof typeof CHANNEL_LABELS] ?? l.method}
                    {l.senderPhone ? ` · ${l.senderPhone}` : ""}
                    {l.reference ? ` · ${l.reference}` : ""}
                    {l.accountName ? ` · Into ${l.accountName}` : ""} · Recorded by {l.recordedBy}
                    {l.note ? ` · ${l.note}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-semibold tnum">{money(l.amount)}</span>
                  {l.kind === "loan" ? null : (
                    <button type="button" className="text-xs text-muted underline" onClick={() => setVoiding(l)}>
                      Void
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>Total</span>
            <span className="tnum">{money(total)}</span>
          </p>
        </>
      )}
      <OtherMoneySheet open={adding} onClose={() => setAdding(false)} />
      {voiding ? (
        <VoidSheet
          open
          onClose={() => setVoiding(null)}
          title="Void this money in"
          explain={`${money(voiding.amount)} from ${voiding.senderName}. It stays in the history, marked void, and stops counting.`}
          run={(reason) => voidOtherMoney({ id: voiding.id, reason })}
        />
      ) : null}
    </Card>
  );
}

function OtherMoneySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<OtherMoneyKind>("owner");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sourceForm = useMoneySource(method);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseNumber(amount);
    if (!Number.isInteger(value) || value <= 0) return setError("Enter the amount received.");
    const problem = checkMoneySource({ method, reference, ...sourceForm.value }, todayHere());
    if (problem) return setError(problem);
    setError(null);
    start(async () => {
      const res = await recordOtherMoney({ kind, amount: value, method, reference, note, ...sourceForm.value });
      if (!res.ok) return setError(res.error);
      setAmount("");
      setReference("");
      setNote("");
      onClose();
      router.refresh();
    });
  }

  return (
    <FormSheet open={open} onClose={onClose} title="Record other money in">
      <form onSubmit={submit} className="space-y-3">
        <Field label="What is it?" hint="Money borrowed goes under Money we owe, and shows here by itself.">
          <Select value={kind} onChange={(e) => setKind(e.target.value as OtherMoneyKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {OTHER_MONEY_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount received">
          <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={method === "mobile_money" ? "Transaction ID" : method === "bank_transfer" ? "Bank reference" : "Reference (optional)"}>
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
        </Field>
        <MoneySourceFields form={sourceForm} method={method} />
        <Field label="Note (optional)">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        {error ? <p className="text-xs text-error-600">{error}</p> : null}
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          Record money in
        </Button>
      </form>
    </FormSheet>
  );
}
