"use client";

// Petty cash (owner, 2026-11-15): one card per box (the boss sees both, a
// holder only theirs), then this month's movements. A box's holder records what
// they paid; the boss also tops up and sets the float. Cards side by side on a
// desktop, stacked on a phone; every form opens in a FormSheet.

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { Card, formatDayTime } from "@repo/ui/accounting/shared";
import { ErrorLine, Form, parseNumber, useMoney, useSubmit } from "@repo/ui/production/sheets";
import { setPettyCashFloat, spendPettyCash, topUpPettyCash } from "@repo/lib/books/actions";
import { DAY_LINE_LABELS, topUpNeeded, type DayLine, type PettyCashBox } from "@repo/lib/books/model";

interface Source {
  id: string;
  name: string;
  kind: string;
}

export function PettyCashBoard({
  boxes,
  lines,
  categories,
  sources,
  isBoss,
  today,
  timeZone,
}: {
  boxes: PettyCashBox[];
  lines: DayLine[];
  categories: { key: string; name: string }[];
  /** Accounts the boss tops up from; empty for a holder. */
  sources: Source[];
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
              <p className="mt-3 text-sm text-muted">In the box</p>
              <p className="text-3xl font-bold tnum">{money(b.balance)}</p>
              <p className="mt-1 text-xs text-muted">
                {b.float === null ? "No float set yet." : `Float ${money(b.float)}`}
                {need > 0 ? <span className="text-warning-700 dark:text-warning-500"> · {money(need)} to top up</span> : null}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setSpending(b)}>
                  Record a payment
                </Button>
                {isBoss ? (
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

      {spending ? <SpendSheet box={spending} categories={categories} onClose={() => setSpending(null)} /> : null}
      {topping ? <TopUpSheet box={topping} sources={sources} today={today} onClose={() => setTopping(null)} /> : null}
      {floating ? <FloatSheet box={floating} onClose={() => setFloating(null)} /> : null}
    </div>
  );
}

function SpendSheet({ box, categories, onClose }: { box: PettyCashBox; categories: { key: string; name: string }[]; onClose: () => void }) {
  const money = useMoney();
  const [id] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categories.find((c) => c.key === "other")?.key ?? categories[0]?.key ?? "");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [description, setDescription] = useState("");
  const { error, pending, submit, setError } = useSubmit(onClose);

  return (
    <FormSheet open onClose={onClose} title={`Record a payment from ${box.name}`}>
      <Form
        onSubmit={() => {
          const value = parseNumber(amount);
          if (!Number.isInteger(value) || value <= 0) return setError("Enter the amount paid.");
          if (value > box.balance) return setError(`The box holds only ${money(box.balance)}. Ask the boss to top it up first.`);
          submit(() => spendPettyCash({ id, boxId: box.id, name, category, amount: value, recipient, description }));
        }}
      >
        <p className="text-xs text-muted">Paid today, in cash from the box. It&apos;s recorded as an expense. The box holds {money(box.balance)}.</p>
        <Field label="What was it for?">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Boda to town, drinking water" maxLength={120} required />
        </Field>
        <Field label="Amount paid">
          <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} required>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid to (optional)">
          <TextInput value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={120} />
        </Field>
        <Field label="Note (optional)">
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </Field>
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          Record payment
        </Button>
      </Form>
    </FormSheet>
  );
}

function TopUpSheet({ box, sources, today, onClose }: { box: PettyCashBox; sources: Source[]; today: string; onClose: () => void }) {
  const money = useMoney();
  const need = topUpNeeded(box);
  const [id] = useState(() => crypto.randomUUID());
  const [from, setFrom] = useState(sources.find((s) => s.kind === "cash")?.id ?? sources[0]?.id ?? "");
  const [amount, setAmount] = useState(need > 0 ? String(need) : "");
  const [reference, setReference] = useState("");
  const { error, pending, submit, setError } = useSubmit(onClose);
  const needsReference = sources.find((s) => s.id === from)?.kind !== "cash";

  return (
    <FormSheet open onClose={onClose} title={`Top up ${box.name}`}>
      <Form
        onSubmit={() => {
          const value = parseNumber(amount);
          if (!Number.isInteger(value) || value <= 0) return setError("Enter the amount.");
          if (needsReference && !reference.trim()) return setError("Enter the slip number or transaction ID.");
          submit(() => topUpPettyCash({ id, fromAccountId: from, toAccountId: box.id, amount: value, movedOn: today, reference, note: "Petty cash top-up" }));
        }}
      >
        <p className="text-xs text-muted">
          It holds {money(box.balance)}
          {box.float !== null ? `; the float is ${money(box.float)}` : ""}. The money moves from another account into the box: it isn&apos;t an expense.
        </p>
        <Field label="From">
          <Select value={from} onChange={(e) => setFrom(e.target.value)} required>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" hint={need > 0 ? `${money(need)} brings it back to the float.` : undefined}>
          <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        {needsReference ? (
          <Field label="Slip number or transaction ID">
            <TextInput value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} required />
          </Field>
        ) : null}
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          Top up
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
