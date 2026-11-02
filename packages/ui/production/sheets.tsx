"use client";

// Production's forms, each in a FormSheet (a sheet on a phone, a side panel
// on a desktop): add or edit a material, record a purchase, count the stock,
// void a purchase, a loan or a repayment; record money borrowed and repayments. Components in packages/ui/production talk only to
// packages/lib/production/{actions,core}.

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { useCurrencySymbol } from "@repo/lib/currency/CurrencySymbolProvider";
import { formatMoney } from "@repo/lib/currency/format";
import { addMaterial, countStock, recordLoan, recordPurchase, recordRepayment, updateMaterial } from "@repo/lib/production/actions";
import {
  CHANNEL_LABELS,
  KIND_LABELS,
  LENDER_KIND_ONE,
  PAID_FROM_LABELS,
  formatQty,
  formatUnitCost,
  interestShare,
  loanOwed,
  unitCostOf,
  type Lender,
  type LenderKind,
  type Loan,
  type Material,
  type MaterialKind,
  type MoneyChannel,
  type PurchasePaidFrom,
} from "@repo/lib/production/core";

/** "50,000" → 50000; "12.5" → 12.5; NaN when it isn't a number. */
export function parseNumber(text: string): number {
  const cleaned = text.replace(/[,\s]/g, "");
  return cleaned === "" ? NaN : Number(cleaned);
}

function useMoney() {
  const symbol = useCurrencySymbol();
  return (n: number) => formatMoney(n, symbol);
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null;
}

/** One sheet's submit: runs the action, shows its error, closes and refreshes on success. */
function useSubmit(onDone: () => void) {
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

function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
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

/** Add a material, or edit one (`material`). */
export function MaterialSheet({ open, onClose, material }: { open: boolean; onClose: () => void; material?: Material }) {
  const symbol = useCurrencySymbol();
  const [name, setName] = useState(material?.name ?? "");
  const [unit, setUnit] = useState(material?.unit ?? "");
  const [kind, setKind] = useState<MaterialKind>(material?.kind ?? "material");
  const [active, setActive] = useState(material?.active ?? true);
  const [cost, setCost] = useState("");
  const { error, pending, submit } = useSubmit(onClose);
  const price = parseNumber(cost);

  return (
    <FormSheet open={open} onClose={onClose} title={material ? `Edit ${material.name}` : "Add a material"}>
      <Form
        onSubmit={() =>
          submit(() =>
            material
              ? updateMaterial({ id: material.id, name, unit, kind, active })
              : addMaterial({ name, unit, kind, unitCost: Number.isFinite(price) ? price : undefined }),
          )
        }
      >
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. A4 photo paper" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Counted in" hint="sheet, pc, m, ml…">
            <TextInput value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="sheet" required />
          </Field>
          <Field label="Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value as MaterialKind)}>
              {(Object.keys(KIND_LABELS) as MaterialKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {material ? (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-brand-500" />
            In use (unticked, it&apos;s hidden from recipes and purchases)
          </label>
        ) : (
          <Field label={`Price per ${unit || "unit"} (optional)`} hint="Until the first purchase is recorded. Purchases set it from then on.">
            <TextInput inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={`e.g. ${symbol} 120`} />
          </Field>
        )}
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending}>
          {material ? "Save" : "Add material"}
        </Button>
      </Form>
    </FormSheet>
  );
}

/** Record a purchase: stock up, the new price, an expense; on credit, money we owe the supplier. */
export function PurchaseSheet({
  open,
  onClose,
  materials,
  materialId,
  today,
}: {
  open: boolean;
  onClose: () => void;
  materials: Material[];
  /** Picked to start with (from a material's own page). */
  materialId?: string;
  today: string;
}) {
  const symbol = useCurrencySymbol();
  const usable = materials.filter((m) => m.active || m.id === materialId);
  const [material, setMaterial] = useState(materialId ?? usable[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");
  const [paidFrom, setPaidFrom] = useState<PurchasePaidFrom>("cash");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [on, setOn] = useState(today);
  const [due, setDue] = useState("");
  const { error, pending, submit } = useSubmit(() => {
    setQty("");
    setTotal("");
    setReference("");
    setNote("");
    onClose();
  });
  const picked = usable.find((m) => m.id === material);
  const q = parseNumber(qty);
  const t = parseNumber(total);
  const unit = q > 0 && t > 0 ? unitCostOf(t, q) : null;

  return (
    <FormSheet open={open} onClose={onClose} title="Record a purchase">
      {usable.length === 0 ? (
        <p className="text-sm text-muted">Add a material first.</p>
      ) : (
        <Form
          onSubmit={() =>
            submit(() =>
              recordPurchase({
                materialId: material,
                qty: q,
                total: t,
                supplier,
                paidFrom,
                reference,
                note,
                purchasedOn: on,
                dueOn: paidFrom === "on_credit" && due ? due : null,
              }),
            )
          }
        >
          <Field label="Material">
            <Select value={material} onChange={(e) => setMaterial(e.target.value)} disabled={!!materialId}>
              {usable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`How many (${picked?.unit ?? "units"})`}>
              <TextInput inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 500" required />
            </Field>
            <Field label="Total paid">
              <TextInput inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="e.g. 60000" required />
            </Field>
          </div>
          {unit !== null && picked ? (
            <p className="text-sm text-muted">
              {formatUnitCost(unit, symbol)} per {picked.unit}
              {picked.unitCost > 0 && unit !== picked.unitCost ? ` (was ${formatUnitCost(picked.unitCost, symbol)})` : ""}. This becomes its price.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid from">
              <Select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value as PurchasePaidFrom)}>
                {(Object.keys(PAID_FROM_LABELS) as PurchasePaidFrom[]).map((p) => (
                  <option key={p} value={p}>
                    {PAID_FROM_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bought on">
              <TextInput type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)} required />
            </Field>
          </div>
          <Field label={paidFrom === "on_credit" ? "Supplier we owe" : "Supplier (optional)"}>
            <TextInput value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Kampala Papers" required={paidFrom === "on_credit"} />
          </Field>
          {paidFrom === "on_credit" ? (
            <Field label="Pay them by (optional)" hint="It shows in Money we owe until it's paid.">
              <TextInput type="date" value={due} min={on} onChange={(e) => setDue(e.target.value)} />
            </Field>
          ) : null}
          <Field label="Reference (optional)" hint="Receipt number, transaction id…">
            <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Note (optional)">
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </Field>
          <ErrorLine error={error} />
          <Button type="submit" className="w-full" loading={pending} disabled={pending || !(q > 0) || !(t > 0)}>
            Record purchase
          </Button>
        </Form>
      )}
    </FormSheet>
  );
}

/** A stock count: the stock becomes what was counted. */
export function StockCountSheet({ open, onClose, material }: { open: boolean; onClose: () => void; material: Material }) {
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const { error, pending, submit } = useSubmit(() => {
    setCounted("");
    setReason("");
    onClose();
  });
  const value = parseNumber(counted);
  const change = Number.isFinite(value) ? value - material.stock : null;

  return (
    <FormSheet open={open} onClose={onClose} title={`Count ${material.name}`}>
      <Form onSubmit={() => submit(() => countStock({ materialId: material.id, counted: value, reason }))}>
        <p className="text-sm text-muted">
          The app says {formatQty(material.stock)} {material.unit}. Enter what&apos;s actually there; the difference is recorded as a stock count.
        </p>
        <Field label={`Counted (${material.unit})`}>
          <TextInput inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} required />
        </Field>
        {change !== null && change !== 0 ? (
          <p className="text-sm">
            {change > 0 ? "+" : ""}
            {formatQty(change)} {material.unit}
          </p>
        ) : null}
        <Field label="Why">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Counted on Friday" required />
        </Field>
        <ErrorLine error={error} />
        <Button type="submit" className="w-full" loading={pending} disabled={pending || !Number.isFinite(value) || change === 0}>
          Save count
        </Button>
      </Form>
    </FormSheet>
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
  const back = toRepay.trim() ? parseNumber(toRepay) : a;
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
          <Field label="To pay back in all" hint="Leave empty if it's the same.">
            <TextInput inputMode="numeric" value={toRepay} onChange={(e) => setToRepay(e.target.value)} placeholder={a > 0 ? String(a) : "e.g. 1100000"} />
          </Field>
        </div>
        {extra > 0 ? <p className="text-sm text-muted">{money(extra)} interest or extra, counted as a cost as it&apos;s paid back.</p> : null}
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
        <Button type="submit" className="w-full" loading={pending} disabled={pending || !(a > 0) || back < a}>
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
          {tooMuch ? <p className="text-sm text-error-600 dark:text-error-400">That&apos;s more than the {money(left)} left on this loan.</p> : null}
          {interest > 0 ? <p className="text-sm text-muted">{money(interest)} of it is interest, counted as a cost; {money(a - interest)} pays back what was borrowed.</p> : null}
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
          <Button type="submit" className="w-full" loading={pending} disabled={pending || !(a > 0) || tooMuch}>
            Record{a > 0 ? ` ${money(a)} repaid` : " repayment"}
          </Button>
        </Form>
      )}
    </FormSheet>
  );
}
