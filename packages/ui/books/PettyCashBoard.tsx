"use client";

// Petty cash (owner, 2026-11-15/16): one card per box (the boss sees both, a
// holder only theirs), then this month's movements. A box's holder sends a
// payment from it by mobile money (Use petty cash); the boss also tops up from
// HivePay and sets the float. Cards side by side on a desktop, stacked on a
// phone; every form opens in a FormSheet.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { Card, formatDayTime } from "@repo/ui/accounting/shared";
import { ErrorLine, Form, parseNumber, useMoney, useSubmit } from "@repo/ui/production/sheets";
import { sendPettyCash, setPettyCashFloat, topUpPettyCash } from "@repo/lib/books/actions";
import { DAY_LINE_LABELS, topUpNeeded, type DayLine, type PettyCashBox } from "@repo/lib/books/model";

export function PettyCashBoard({
  boxes,
  lines,
  hivepayId,
  isBoss,
  today,
  timeZone,
}: {
  boxes: PettyCashBox[];
  lines: DayLine[];
  /** HivePay's account, which the boss tops up from; null for a holder. */
  hivepayId: string | null;
  isBoss: boolean;
  today: string;
  timeZone: string;
}) {
  const money = useMoney();
  const [spending, setSpending] = useState<PettyCashBox | null>(null);
  const [topping, setTopping] = useState<PettyCashBox | null>(null);
  const [floating, setFloating] = useState<PettyCashBox | null>(null);
  const names = new Map(boxes.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {boxes.map((b) => {
          const need = topUpNeeded(b);
          return (
            <section key={b.id} className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{b.name}</h2>
                  <p className="text-xs text-muted">Held by the {b.heldBy.toLowerCase()}s</p>
                </div>
                {isBoss ? (
                  <button type="button" className="shrink-0 text-xs text-muted underline" onClick={() => setFloating(b)}>
                    {b.float === null ? "Set float" : "Change float"}
                  </button>
                ) : null}
              </div>
              <p className="mt-3 text-sm text-muted">Can send</p>
              <p className="text-3xl font-bold tnum">{money(b.balance)}</p>
              <p className="mt-1 text-xs text-muted">
                {b.float === null ? "No float set yet." : `Float ${money(b.float)}`}
                {need > 0 ? <span className="text-warning-700 dark:text-warning-500"> · {money(need)} to top up</span> : null}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setSpending(b)}>
                  Use petty cash
                </Button>
                {isBoss && hivepayId ? (
                  <Button size="sm" variant="secondary" onClick={() => setTopping(b)}>
                    Top up
                  </Button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <Card title="This month">
        {lines.length === 0 ? (
          <p className="text-sm text-muted">Nothing in or out of {boxes.length === 1 ? "the box" : "the boxes"} this month.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {lines.map((l) => (
              <li key={`${l.kind}-${l.id}-${l.direction}`} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{l.kind === "move" ? (l.direction === "in" ? "Top-up" : "Taken out") : (l.detail ?? DAY_LINE_LABELS[l.kind])}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDayTime(l.at, timeZone)}
                    {boxes.length > 1 ? ` · ${names.get(l.accountId ?? "") ?? ""}` : ""}
                    {l.kind === "move" ? ` · ${l.party}` : l.party && l.party !== l.detail ? ` · To ${l.party}` : ""}
                    {l.recordedBy ? ` · ${l.recordedBy}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 font-semibold tnum ${l.direction === "in" ? "text-success-700 dark:text-success-500" : ""}`}>
                  {l.direction === "in" ? "+" : "−"}
                  {money(l.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {spending ? <SendSheet box={spending} onClose={() => setSpending(null)} /> : null}
      {topping && hivepayId ? <TopUpSheet box={topping} hivepayId={hivepayId} today={today} onClose={() => setTopping(null)} /> : null}
      {floating ? <FloatSheet box={floating} onClose={() => setFloating(null)} /> : null}
    </div>
  );
}

function SendSheet({ box, onClose }: { box: PettyCashBox; onClose: () => void }) {
  const money = useMoney();
  const router = useRouter();
  const [id] = useState(() => crypto.randomUUID());
  const [expenseId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [charge, setCharge] = useState("");
  const [recipient, setRecipient] = useState("");
  const [phone, setPhone] = useState("");
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const value = parseNumber(amount);
  const fee = charge.trim() === "" ? 0 : parseNumber(charge);
  const total = value + fee;
  const problem = !(value > 0)
    ? null
    : !Number.isInteger(value) || !Number.isInteger(fee) || fee < 0
      ? "Enter whole shillings."
      : total > box.balance
        ? `The box can send only ${money(box.balance)}. Ask the boss to top it up first.`
        : total < 500 || total > 5_000_000
          ? "HivePay sends from 500 to 5,000,000 at a time."
          : null;
  const ready = name.trim() !== "" && value > 0 && !problem && recipient.trim() !== "" && phone.trim() !== "";

  function send() {
    setError(null);
    start(async () => {
      const res = await sendPettyCash({ id, expenseId, boxId: box.id, name, amount: value, charge: fee, recipient, phone });
      if (!res.ok) {
        setSure(false);
        return setError(res.error);
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <FormSheet open onClose={onClose} title={`Use petty cash: ${box.name}`}>
      <div className="space-y-4">
        <p className="text-xs text-muted">Sent at once by mobile money to the person&apos;s phone. The box can send {money(box.balance)}.</p>
        <Field label="What is it for?">
          <TextInput value={name} disabled={sure} onChange={(e) => setName(e.target.value)} placeholder="e.g. Boda to town, drinking water" maxLength={120} />
        </Field>
        <Field label="Amount">
          <TextInput inputMode="numeric" value={amount} disabled={sure} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Withdraw charge" hint="What the person pays to cash it out. It's sent with the amount. Leave empty if none.">
          <TextInput inputMode="numeric" value={charge} disabled={sure} onChange={(e) => setCharge(e.target.value)} />
        </Field>
        <Field label="Who receives it?">
          <TextInput value={recipient} disabled={sure} onChange={(e) => setRecipient(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Their MTN or Airtel number">
          <TextInput type="tel" value={phone} disabled={sure} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0772 000 000" />
        </Field>
        {problem ? <p className="text-sm text-error-600 dark:text-error-400">{problem}</p> : null}
        {ready ? (
          <p className="text-sm text-muted">
            {recipient.trim()} receives {money(total)}
            {fee > 0 ? ` (${money(value)} + ${money(fee)} withdraw charge)` : ""}. HivePay&apos;s own fee is Aming&apos;s, from HivePay, not from the box.
          </p>
        ) : null}
        <ErrorLine error={error} />
        {sure ? (
          <div className="space-y-2 rounded-xl bg-warning-50 p-3 dark:bg-warning-500/10">
            <p className="text-sm font-medium">
              Send {money(total)} to {recipient.trim()} on {phone.trim()}? Real money leaves at once and can&apos;t be pulled back.
            </p>
            <div className="flex gap-2">
              <Button loading={pending} disabled={pending} className="flex-1" onClick={send}>
                Yes, send {money(total)}
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => setSure(false)}>
                Change
              </Button>
            </div>
          </div>
        ) : (
          <Button className="w-full" disabled={!ready} onClick={() => setSure(true)}>
            Continue
          </Button>
        )}
      </div>
    </FormSheet>
  );
}

function TopUpSheet({ box, hivepayId, today, onClose }: { box: PettyCashBox; hivepayId: string; today: string; onClose: () => void }) {
  const money = useMoney();
  const need = topUpNeeded(box);
  const [id] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(need > 0 ? String(need) : "");
  const { error, pending, submit, setError } = useSubmit(onClose);

  return (
    <FormSheet open onClose={onClose} title={`Top up ${box.name}`}>
      <Form
        onSubmit={() => {
          const value = parseNumber(amount);
          if (!Number.isInteger(value) || value <= 0) return setError("Enter the amount.");
          submit(() => topUpPettyCash({ id, fromAccountId: hivepayId, toAccountId: box.id, amount: value, movedOn: today, reference: "", note: "Petty cash top-up" }));
        }}
      >
        <p className="text-xs text-muted">
          It holds {money(box.balance)}
          {box.float !== null ? `; the float is ${money(box.float)}` : ""}. The money is set aside from HivePay for the box: it stays in HivePay and isn&apos;t an expense.
        </p>
        <Field label="Amount" hint={need > 0 ? `${money(need)} brings it back to the float.` : undefined}>
          <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          Top up from HivePay
        </Button>
      </Form>
    </FormSheet>
  );
}

function FloatSheet({ box, onClose }: { box: PettyCashBox; onClose: () => void }) {
  const [amount, setAmount] = useState(box.float === null ? "" : String(box.float));
  const { error, pending, submit, setError } = useSubmit(onClose);

  return (
    <FormSheet open onClose={onClose} title={`Float for ${box.name}`}>
      <Form
        onSubmit={() => {
          const value = amount.trim() === "" ? null : parseNumber(amount);
          if (value !== null && (!Number.isInteger(value) || value < 0)) return setError("Enter the float in whole shillings.");
          submit(() => setPettyCashFloat({ boxId: box.id, amount: value }));
        }}
      >
        <p className="text-xs text-muted">What you keep the box topped up to. Top up shows how much brings it back to this.</p>
        <Field label="Float">
          <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 200,000" />
        </Field>
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          Save float
        </Button>
      </Form>
    </FormSheet>
  );
}
