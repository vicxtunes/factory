"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import { createInvoice, createQuotation, updateInvoice, updateQuotation } from "@repo/lib/billing/actions";
import { priceLine, totalsOf, type LineInput, type Shoot } from "@repo/lib/billing/core";
import { offeringLabel, type Offering } from "@repo/lib/offerings/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { timeSpan } from "@repo/ui/bookings/BookingBits";
import { WhenFields, whenTimes, type When } from "@repo/ui/bookings/WhenFields";
import { StepActions, StepIndicator, useSteps } from "@repo/ui/Stepper";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";

/** A line as typed: numbers stay strings until saved, so half-typed values don't jump. */
interface Draft {
  key: number;
  offeringId: string | null;
  description: string;
  inclusions: string;
  quantity: string;
  unitPrice: string;
  discountKind: "" | "percent" | "amount";
  discountValue: string;
}

let nextKey = 0;
const number = (s: string) => (s.trim() === "" ? Number.NaN : Number(s.replace(/[,\s]/g, "")));

const draftOf = (l: LineInput): Draft => ({
  key: nextKey++,
  offeringId: l.offeringId,
  description: l.description,
  inclusions: l.inclusions.join("\n"),
  quantity: String(l.quantity),
  unitPrice: String(l.unitPrice),
  discountKind: l.discount?.kind ?? "",
  discountValue: l.discount ? String(l.discount.value) : "",
});

/** What's sent: NaN for an empty number, refused by the server with a clear message. */
const inputOf = (d: Draft): LineInput => ({
  offeringId: d.offeringId,
  description: d.description,
  inclusions: d.inclusions.split("\n"),
  quantity: number(d.quantity),
  unitPrice: number(d.unitPrice),
  discount: d.discountKind ? { kind: d.discountKind, value: number(d.discountValue) } : null,
});

/** The document being edited, whichever kind. `date` is its valid-until (quotation) or due date (invoice). */
export interface EditableDocument {
  id: string;
  customerId: string;
  date: string | null;
  shoot: Shoot | null;
  /** The booking its shoot made, left out of the clash warning. */
  bookingId: string | null;
  notes: string | null;
  lines: LineInput[];
}

type SaveInput = { customerId: string; date: string | null; shoot: Shoot | null; notes: string; lines: LineInput[]; bookingId: string | null };

/** A new document made from a booking: its client, when, and what was agreed, ready to send. */
export interface FromBooking {
  id: string;
  customerId: string;
  shoot: Shoot;
  lines: LineInput[];
}

const KINDS = {
  quotation: {
    dateLabel: "Valid until",
    dateHint: "Optional. After this day it can't be accepted.",
    create: "Create quotation",
    shootHint: "Optional. When the client accepts, the date is held as a pending booking.",
    save: (doc: EditableDocument | undefined, input: SaveInput) => {
      const body = { customerId: input.customerId, validUntil: input.date, shoot: input.shoot, notes: input.notes, lines: input.lines };
      return doc ? updateQuotation(doc.id, body) : createQuotation(body, input.bookingId);
    },
  },
  invoice: {
    dateLabel: "Due date",
    dateHint: "Optional. Unpaid after this day shows as overdue.",
    create: "Create invoice",
    shootHint: "Optional. Saving the invoice books it (confirmed), or moves its booking.",
    save: (doc: EditableDocument | undefined, input: SaveInput) => {
      const body = { customerId: input.customerId, dueDate: input.date, shoot: input.shoot, notes: input.notes, lines: input.lines };
      return doc ? updateInvoice(doc.id, body) : createInvoice(body, input.bookingId);
    },
  },
};

// "Items": what's charged for, one per package or custom entry (stored as lines).
const STEPS = ["Client", "Shoot", "Items", "Review"];
const card = "rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5";

/**
 * Creates a quotation or invoice (no `document`) or edits one, in steps: the
 * client and its date; when the shoot is (optional, what books it); the
 * lines, copied from packages and services or typed, with line discounts;
 * then a last look with the totals and notes. Each step checks its own fields
 * before the next. A new one can start from a booking (`fromBooking`): its
 * client (fixed), shoot and package, and saving makes it that booking's. Totals update as you type, using the same rules the
 * server saves with.
 */
export function DocumentEditor({
  kind,
  document: doc,
  customers,
  offerings,
  presetCustomerId,
  fromBooking,
  scope,
  basePath,
}: {
  kind: keyof typeof KINDS;
  document?: EditableDocument;
  customers: { id: string; name: string }[];
  offerings: Offering[];
  presetCustomerId?: string;
  fromBooking?: FromBooking;
  scope: Pick<TenantScope, "currency" | "locale" | "timeZone">;
  /** The document's pages live at `${basePath}/${id}`. */
  basePath: string;
}) {
  const router = useRouter();
  const k = KINDS[kind];
  const [customerId, setCustomerId] = useState(doc?.customerId ?? fromBooking?.customerId ?? presetCustomerId ?? "");
  const startShoot = doc?.shoot ?? fromBooking?.shoot ?? null;
  const [date, setDate] = useState(doc?.date ?? "");
  const [shoot, setShoot] = useState<When>({
    date: startShoot?.date ?? "",
    allDay: !!startShoot && startShoot.startTime === null,
    startTime: startShoot?.startTime ?? "",
    endTime: startShoot?.endTime ?? "",
  });
  const [notes, setNotes] = useState(doc?.notes ?? "");
  const [lines, setLines] = useState<Draft[]>((doc?.lines ?? fromBooking?.lines ?? []).map(draftOf));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const steps = useSteps(STEPS.length, !!doc);
  const money = (n: number) => formatAmount(scope, n);

  const update = (key: number, patch: Partial<Draft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));

  function addOffering(id: string) {
    const o = offerings.find((x) => x.id === id);
    if (!o) return;
    setLines((ls) => [
      ...ls,
      draftOf({ offeringId: o.id, description: offeringLabel(o), inclusions: o.inclusions, quantity: 1, unitPrice: o.price, discount: null }),
    ]);
  }

  const addCustom = () => setLines((ls) => [...ls, draftOf({ offeringId: null, description: "", inclusions: [], quantity: 1, unitPrice: 0, discount: null })]);

  // Live totals over the lines that are complete enough to price.
  const priced = lines
    .map(inputOf)
    .filter((l) => Number.isFinite(l.quantity) && Number.isFinite(l.unitPrice) && (!l.discount || Number.isFinite(l.discount.value)));
  const totals = totalsOf(priced.map(priceLine));

  // Next (the browser has checked this step's fields), or on the last step, save.
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (steps.step === 2 && lines.length === 0) return setError("Add at least one item: a package or a custom item.");
    setError(null);
    if (!steps.last) return steps.next();
    start(async () => {
      const res = await k.save(doc, {
        customerId,
        date: date || null,
        shoot: shoot.date ? { date: shoot.date, ...whenTimes(shoot) } : null,
        notes,
        lines: lines.map(inputOf),
        bookingId: fromBooking?.id ?? null,
      });
      if (!res.ok) return setError(res.error);
      router.push(`${basePath}/${res.data}`);
      router.refresh();
    });
  }

  const clientName = customers.find((c) => c.id === customerId)?.name ?? "—";

  return (
    <div className="space-y-4">
      <StepIndicator titles={STEPS} step={steps.step} reached={steps.reached} onGo={steps.go} />
      <form onSubmit={submit} className="space-y-4">
        {steps.step === 0 ? (
          <div className={`grid gap-4 sm:grid-cols-2 ${card}`}>
            <Field label="Client">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required disabled={!!fromBooking}>
                <option value="">Choose a client…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={k.dateLabel} hint={k.dateHint}>
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
        ) : null}

        {steps.step === 1 ? (
          <div className={card}>
            <WhenFields
              value={shoot}
              onChange={setShoot}
              dateLabel="Shoot day"
              dateRequired={false}
              dateHint={`${k.shootHint} Leave it empty if there's no shoot.`}
              exceptBookingId={doc?.bookingId ?? fromBooking?.id ?? null}
              bookingsPath="/studio/bookings"
            />
          </div>
        ) : null}

        {steps.step === 2 ? (
          <section className="space-y-3">
            {lines.map((l, i) => {
              const line = priceLine(inputOf(l));
              return (
                <div key={l.key} className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Item {i + 1}</p>
                    <button type="button" onClick={() => remove(l.key)} className="text-xs text-error-600 hover:underline dark:text-error-400">
                      Remove
                    </button>
                  </div>
                  <Field label="Description">
                    <TextInput value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} required maxLength={200} />
                  </Field>
                  <Field label="What's included" hint="One item per line.">
                    <TextArea value={l.inclusions} onChange={(e) => update(l.key, { inclusions: e.target.value })} rows={2} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field label="Qty">
                      <TextInput value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} inputMode="numeric" required />
                    </Field>
                    <Field label={`Price (${scope.currency})`}>
                      <TextInput value={l.unitPrice} onChange={(e) => update(l.key, { unitPrice: e.target.value })} inputMode="numeric" required />
                    </Field>
                    <Field label="Discount">
                      <Select value={l.discountKind} onChange={(e) => update(l.key, { discountKind: e.target.value as Draft["discountKind"] })}>
                        <option value="">None</option>
                        <option value="percent">% off</option>
                        <option value="amount">{scope.currency} off</option>
                      </Select>
                    </Field>
                    {l.discountKind ? (
                      <Field label={l.discountKind === "percent" ? "Percent" : "Amount off each"}>
                        <TextInput value={l.discountValue} onChange={(e) => update(l.key, { discountValue: e.target.value })} inputMode="numeric" required />
                      </Field>
                    ) : null}
                  </div>
                  {Number.isFinite(line.total) ? <p className="text-right text-sm font-medium tnum">{money(line.total)}</p> : null}
                </div>
              );
            })}

            <div className="flex flex-wrap gap-2">
              {offerings.length ? (
                <Select value="" onChange={(e) => addOffering(e.target.value)} aria-label="Add a package" className="sm:max-w-xs">
                  <option value="">+ Add a package…</option>
                  {/* Grouped by service; `offerings` comes in service order. */}
                  {[...new Set(offerings.map((o) => o.serviceId))].map((serviceId) => {
                    const tiers = offerings.filter((o) => o.serviceId === serviceId);
                    return (
                      <optgroup key={serviceId} label={tiers[0].serviceName}>
                        {tiers.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} · {money(o.price)}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </Select>
              ) : null}
              <Button type="button" variant="secondary" onClick={addCustom}>
                + Custom item
              </Button>
            </div>
            {lines.length ? (
              <p className="text-right text-sm">
                Total so far: <span className="font-semibold tnum">{money(totals.total)}</span>
              </p>
            ) : null}
          </section>
        ) : null}

        {steps.step === 3 ? (
          <div className={`space-y-4 ${card}`}>
            {/* A last look at what the earlier steps hold; the indicator opens any of them to change it. */}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Client</dt>
              <dd className="font-medium">{clientName}</dd>
              <dt className="text-muted">{k.dateLabel}</dt>
              <dd>{date ? formatDay(scope, date) : "—"}</dd>
              <dt className="text-muted">Shoot</dt>
              <dd>{shoot.date ? `${formatDay(scope, shoot.date)}, ${timeSpan(whenTimes(shoot))}` : "None"}</dd>
            </dl>
            <ul className="divide-y divide-border border-y border-border text-sm">
              {lines.map((l) => {
                const line = priceLine(inputOf(l));
                return (
                  <li key={l.key} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0">
                      {l.description || "—"} <span className="text-muted">× {l.quantity}</span>
                    </span>
                    <span className="shrink-0 tnum">{Number.isFinite(line.total) ? money(line.total) : "—"}</span>
                  </li>
                );
              })}
            </ul>
            <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              {totals.discount > 0 ? (
                <>
                  <dt className="text-muted">Subtotal</dt>
                  <dd className="text-right tnum">{money(totals.subtotal)}</dd>
                  <dt className="text-muted">Discount</dt>
                  <dd className="text-right tnum">−{money(totals.discount)}</dd>
                </>
              ) : null}
              <dt className="font-semibold">Total</dt>
              <dd className="text-right text-base font-semibold tnum">{money(totals.total)}</dd>
            </dl>
            <Field label="Notes" hint={`Terms, deposit, how to pay. Shown on the ${kind}.`}>
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
            </Field>
          </div>
        ) : null}

        {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
        <StepActions first={steps.step === 0} last={steps.last} onBack={steps.back} submitLabel={doc ? "Save changes" : k.create} pending={pending} />
      </form>
    </div>
  );
}
