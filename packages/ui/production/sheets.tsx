"use client";

// Production's forms, each in a FormSheet (a sheet on a phone, a side panel
// on a desktop): void a loan or a repayment; record money borrowed and
// repayments; and the small pieces the costing forms share (costing.tsx).
// Components in packages/ui/production talk only to packages/lib/production/{actions,core}.

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { recordLoan, recordRepayment } from "@repo/lib/production/actions";
import {
  CHANNEL_LABELS,
  INTEREST_PER_LABELS,
  LENDER_KIND_ONE,
  interestShare,
  loanOwed,
  type Lender,
  type InterestPer,
  type LenderKind,
  type Loan,
  type MoneyChannel,
} from "@repo/lib/production/core";

/** "50,000" → 50000; "12.5" → 12.5; NaN when it isn't a number. */
export function parseNumber(text: string): number {
  const cleaned = text.replace(/[,\s]/g, "");
  return cleaned === "" ? NaN : Number(cleaned);
}

export function useMoney() {
  const symbol = useCurrencySymbol();
  return (n: number) => formatMoney(n, symbol);
}

export function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null;
}

/** One sheet's submit: runs the action, shows its error, closes and refreshes on success. */
export function useSubmit(onDone: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit(run: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const res = await run();
      if (!res.ok) return setError(res.error);
      onDone();
      router.refresh();
    });
  }
  return { error, pending, submit, setError };
}

export function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** Common measures for "Counted in"; anything else is typed under Other. */
const UNITS: [string, string][] = [
  ["pc", "piece (pc)"],
  ["sheet", "sheet"],
  ["m", "metre (m)"],
  ["cm", "centimetre (cm)"],
  ["m²", "square metre (m²)"],
  ["roll", "roll"],
  ["pack", "pack"],
  ["box", "box"],
  ["set", "set"],
  ["l", "litre (l)"],
  ["ml", "millilitre (ml)"],
  ["kg", "kilogram (kg)"],
  ["g", "gram (g)"],
];
const OTHER_UNIT = "__other";

export function UnitField({ value, onChange }: { value: string; onChange: (unit: string) => void }) {
  const known = UNITS.some(([u]) => u === value);
  const [other, setOther] = useState(!known && value !== "");
  return (
    <Field label="Counted in">
      <div className="space-y-2">
        <Select
          value={other ? OTHER_UNIT : value}
          onChange={(e) => {
            if (e.target.value === OTHER_UNIT) {
              setOther(true);
              onChange("");
            } else {
              setOther(false);
              onChange(e.target.value);
            }
          }}
          required
        >
          <option value="">Choose…</option>
          {UNITS.map(([u, label]) => (
            <option key={u} value={u}>
              {label}
            </option>
          ))}
          <option value={OTHER_UNIT}>Other…</option>
        </Select>
        {other ? <TextInput value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. tube" maxLength={20} required aria-label="Your own measure" /> : null}
      </div>
    </Field>
  );
}

/** Voids something with a reason (a purchase, a loan, a repayment): it stays in the history, marked void, and what it did is undone. */
export function VoidSheet({
  open,
  onClose,
  title,
  explain,
  run,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  explain: string;
  run: (reason: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [reason, setReason] = useState("");
  const { error, pending, submit } = useSubmit(onClose);
  return (
    <FormSheet open={open} onClose={onClose} title={title}>
      <Form onSubmit={() => submit(() => run(reason))}>
        <p className="text-sm text-muted">{explain}</p>
        <Field label="Why">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" required />
        </Field>
        <ErrorLine error={error} />
        <Button type="submit" variant="danger" className="w-full" loading={pending} disabled={pending}>
          {title}
        </Button>
      </Form>
    </FormSheet>
  );
}

/** Money borrowed: from someone already known, or someone new. */
export function LoanSheet({ open, onClose, lenders, lenderId, today }: { open: boolean; onClose: () => void; lenders: Lender[]; lenderId?: string; today: string }) {
  const money = useMoney();
  const [who, setWho] = useState(lenderId ?? lenders[0]?.id ?? "new");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<LenderKind>("owner");
  const [amount, setAmount] = useState("");
  const [toRepay, setToRepay] = useState("");
  const [terms, setTerms] = useState<"fixed" | "rate">("fixed");
  const [rate, setRate] = useState("");
  const [per, setPer] = useState<InterestPer>("month");
  const [into, setInto] = useState<MoneyChannel>("cash");
  const [on, setOn] = useState(today);
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const { error, pending, submit } = useSubmit(() => {
    setAmount("");
    setToRepay("");
    setNote("");
    setDue("");
    onClose();
  });
  const a = parseNumber(amount);
  const withRate = terms === "rate";
  const r = parseNumber(rate);
  const back = !withRate && toRepay.trim() ? parseNumber(toRepay) : a;
  const extra = a > 0 && back >= a ? back - a : 0;

  return (
    <FormSheet open={open} onClose={onClose} title="Record money borrowed">
      <Form
        onSubmit={() =>
          submit(() =>
            recordLoan({
              lenderId: who === "new" ? null : who,
              lender: who === "new" ? { name, phone, kind } : null,
              amount: a,
              toRepay: back,
              interestRate: withRate ? r : null,
              interestPer: withRate ? per : null,
              receivedOn: on,
              receivedInto: into,
              dueOn: due || null,
              note,
            }),
          )
        }
      >
        <p className="text-sm text-muted">Money that came into the business and has to be paid back. It isn&apos;t income; only the extra paid back (interest) counts as a cost.</p>
        <Field label="Who lent it">
          <Select value={who} onChange={(e) => setWho(e.target.value)} disabled={!!lenderId}>
            {lenders.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({LENDER_KIND_ONE[l.kind]})
              </option>
            ))}
            <option value="new">Someone new…</option>
          </Select>
        </Field>
        {who === "new" ? (
          <>
            <Field label="Name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Centenary SACCO" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Who they are">
                <Select value={kind} onChange={(e) => setKind(e.target.value as LenderKind)}>
                  {(Object.keys(LENDER_KIND_ONE) as LenderKind[])
                    .filter((k) => k !== "supplier")
                    .map((k) => (
                      <option key={k} value={k}>
                        {LENDER_KIND_ONE[k]}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Phone (optional)">
                <TextInput type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </div>
          </>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount borrowed">
            <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 1000000" required />
          </Field>
          <Field label="Interest">
            <Select value={terms} onChange={(e) => setTerms(e.target.value as "fixed" | "rate")}>
              <option value="fixed">None, or a fixed extra</option>
              <option value="rate">A rate</option>
            </Select>
          </Field>
        </div>
        {withRate ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rate (%)">
                <TextInput inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 3" required />
              </Field>
              <Field label="Per">
                <Select value={per} onChange={(e) => setPer(e.target.value as InterestPer)}>
                  <option value="day">Day</option>
                  <option value="month">Month (30 days)</option>
                  <option value="year">Year (365 days)</option>
                </Select>
              </Field>
            </div>
            <p className="text-sm text-muted">
              {a > 0 && r > 0 ? `${money(Math.round((a * r) / 100))} ${INTEREST_PER_LABELS[per]} to begin with. ` : ""}
              Simple interest on what&apos;s left of the amount borrowed. Each repayment clears the interest first, and only interest counts as a cost.
            </p>
          </>
        ) : (
          <>
            <Field label="To pay back in all" hint="Leave empty if it's the same.">
              <TextInput inputMode="numeric" value={toRepay} onChange={(e) => setToRepay(e.target.value)} placeholder={a > 0 ? String(a) : "e.g. 1100000"} />
            </Field>
            {extra > 0 ? <p className="text-sm text-muted">{money(extra)} interest or extra, counted as a cost as it&apos;s paid back.</p> : null}
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Came in as">
            <Select value={into} onChange={(e) => setInto(e.target.value as MoneyChannel)}>
              {(Object.keys(CHANNEL_LABELS) as MoneyChannel[]).map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="On">
            <TextInput type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)} required />
          </Field>
        </div>
        <Field label="Pay back by (optional)">
          <TextInput type="date" value={due} min={on} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Note (optional)" hint="Terms, what it was for…">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </Field>
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending || !(a > 0) || back < a || (withRate && !(r > 0))}>
          Record{a > 0 ? ` ${money(a)} borrowed` : ""}
        </Button>
      </Form>
    </FormSheet>
  );
}

/** A repayment on one loan; shows its interest share before saving. */
export function RepaymentSheet({ open, onClose, loans, loanId, today }: { open: boolean; onClose: () => void; loans: Loan[]; loanId?: string; today: string }) {
  const money = useMoney();
  const [loan, setLoan] = useState(loanId ?? loans[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState<MoneyChannel>("cash");
  const [on, setOn] = useState(today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const { error, pending, submit } = useSubmit(() => {
    setAmount("");
    setReference("");
    setNote("");
    onClose();
  });
  const picked = loans.find((l) => l.id === loan);
  const left = picked ? loanOwed(picked) : 0;
  const a = parseNumber(amount);
  const tooMuch = a > left;
  const interest = picked && a > 0 && !tooMuch ? interestShare(picked, a) : 0;
  // A rate's interest depends on the day: what's shown is as of today.
  const otherDay = picked?.interestRate != null && on !== today;

  return (
    <FormSheet open={open} onClose={onClose} title="Record a repayment">
      {loans.length === 0 ? (
        <p className="text-sm text-muted">Nothing is owed right now.</p>
      ) : (
        <Form onSubmit={() => submit(() => recordRepayment({ loanId: loan, amount: a, paidOn: on, paidFrom: from, reference, note }))}>
          <Field label="Paying back">
            <Select value={loan} onChange={(e) => setLoan(e.target.value)} disabled={!!loanId}>
              {loans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lenderName}: {money(loanOwed(l))} left of {money(l.toRepay)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" hint={picked ? `${money(left)} left to pay.` : undefined}>
              <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={left ? String(left) : ""} required />
            </Field>
            <Field label="Paid on">
              <TextInput type="date" value={on} min={picked?.receivedOn} max={today} onChange={(e) => setOn(e.target.value)} required />
            </Field>
          </div>
          {otherDay ? <p className="text-sm text-muted">Interest is worked out for the date you chose when you save, so the amount left may differ from this.</p> : null}
          {tooMuch ? <p className="text-sm text-error-600 dark:text-error-400">That&apos;s more than the {money(left)} left on this loan.</p> : null}
          {interest > 0 && !otherDay ? <p className="text-sm text-muted">{money(interest)} of it is interest, counted as a cost; {money(a - interest)} pays back what was borrowed.</p> : null}
          <Field label="Paid from">
            <Select value={from} onChange={(e) => setFrom(e.target.value as MoneyChannel)}>
              {(Object.keys(CHANNEL_LABELS) as MoneyChannel[]).map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference (optional)">
            <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Note (optional)">
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </Field>
          <ErrorLine error={error} />
          <Button type="submit" className="w-full" loading={pending} disabled={pending || !(a > 0) || (tooMuch && !otherDay)}>
            Record{a > 0 ? ` ${money(a)} repaid` : " repayment"}
          </Button>
        </Form>
      )}
    </FormSheet>
  );
}
