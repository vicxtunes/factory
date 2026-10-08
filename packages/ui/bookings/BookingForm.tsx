"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import { StepActions, StepIndicator, useSteps } from "@repo/ui/Stepper";
import { priceLine } from "@repo/lib/billing/core";
import { createBooking, updateBooking } from "@repo/lib/bookings/actions";
import type { Booking, BookingDraft } from "@repo/lib/bookings/core";
import { formatAmount, formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { timeSpan } from "./BookingBits";
import { WhenFields, whenTimes, type When } from "./WhenFields";

const STEPS = ["Client", "When & where", "Package & review"];

/** What was agreed: a package (and its discount, typed), or a custom request. */
interface Deal {
  mode: "package" | "custom";
  discountKind: "" | "percent" | "amount";
  discountValue: string;
}

/** "250,000" as typed; empty or not a number gives NaN, which is refused. */
const number = (s: string) => (s.trim() === "" ? Number.NaN : Number(s.replace(/[,\s]/g, "")));
const card = "space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5";

/**
 * Books a client (no `booking`) or changes a booking's details, in steps: the
 * client and a title; the day, times (with the clash warning) and where; then
 * what was agreed (one of the studio's packages at its price, less any
 * discount; or the client's own request at a price agreed with them) and
 * notes, with a last look. A booking can start from an
 * accepted quotation (`draft`): its client is then fixed and the package and
 * amount are filled in.
 */
export function BookingForm({
  booking,
  draft,
  date,
  presetCustomerId,
  customers,
  packages,
  scope,
  basePath,
}: {
  booking?: Booking;
  draft?: BookingDraft;
  /** Pre-filled day for a new booking, "yyyy-mm-dd". */
  date?: string;
  /** Pre-chosen client for a new booking (from the client's page). */
  presetCustomerId?: string;
  customers: { id: string; name: string }[];
  /** The studio's packages, with their prices. */
  packages: { label: string; price: number }[];
  scope: Pick<TenantScope, "currency" | "locale" | "timeZone">;
  basePath: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    customerId: booking?.customerId ?? draft?.customerId ?? presetCustomerId ?? "",
    title: booking?.title ?? draft?.title ?? "",
    location: booking?.location ?? "",
    packageName: booking?.packageName ?? draft?.packageName ?? "",
    amount: booking?.amount != null ? String(booking.amount) : draft ? String(draft.amount) : "",
    notes: booking?.notes ?? "",
  });
  // A new booking's times start empty: chosen, never assumed.
  const [when, setWhen] = useState<When>({
    date: booking?.date ?? date ?? "",
    allDay: booking ? booking.startTime === null : false,
    startTime: booking?.startTime ?? "",
    endTime: booking?.endTime ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const steps = useSteps(STEPS.length, !!booking);
  const clientFixed = !!(draft || booking?.quotationId);

  // What was agreed. A package keeps its price; a deal is a discount off it (an earlier lower amount reads as one).
  // Anything the studio hasn't packaged is a custom request at the price agreed with the client.
  const [deal, setDeal] = useState<Deal>(() => {
    const pkg = packages.find((p) => p.label === form.packageName);
    const amount = booking?.amount ?? draft?.amount ?? null;
    if (pkg) return { mode: "package", discountKind: amount != null && amount < pkg.price ? "amount" : "", discountValue: amount != null && amount < pkg.price ? String(pkg.price - amount) : "" };
    return { mode: packages.length && !form.packageName && form.amount === "" ? "package" : "custom", discountKind: "", discountValue: "" };
  });
  const chosen = deal.mode === "package" ? packages.find((p) => p.label === form.packageName) : undefined;
  const discount = deal.discountKind ? { kind: deal.discountKind, value: number(deal.discountValue) } : null;
  const agreed = chosen
    ? priceLine({ offeringId: null, description: "", inclusions: [], quantity: 1, unitPrice: chosen.price, discount }).netUnitPrice
    : number(form.amount);
  const money = (n: number) => formatAmount(scope, n);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Next (the browser has checked this step's fields), or on the last step, save.
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!steps.last) return steps.next();
    if (chosen && discount && !(discount.value > 0 && (discount.kind === "percent" ? discount.value <= 100 : discount.value <= chosen.price))) {
      return setError(discount.kind === "percent" ? "A discount is between 1 and 100%." : "The discount can't be more than the package's price.");
    }
    const input = {
      customerId: form.customerId,
      title: form.title,
      date: when.date,
      ...whenTimes(when),
      location: form.location,
      packageName: form.packageName,
      // A package: its price less the discount. A custom request: the agreed price (not a number is refused by the server).
      amount: agreed,
      notes: form.notes,
      quotationId: draft?.quotationId ?? null,
    };
    start(async () => {
      if (booking) {
        const res = await updateBooking(booking.id, input);
        if (!res.ok) return setError(res.error);
        router.push(`${basePath}/${booking.id}`);
      } else {
        const res = await createBooking(input);
        if (!res.ok) return setError(res.error);
        router.push(`${basePath}/${res.data}`);
      }
      router.refresh();
    });
  }

  const clientName = customers.find((c) => c.id === form.customerId)?.name ?? "—";

  return (
    <div className="space-y-4">
      <StepIndicator titles={STEPS} step={steps.step} reached={steps.reached} onGo={steps.go} />
      <form onSubmit={submit} className="space-y-4">
        {steps.step === 0 ? (
          <div className={`grid gap-4 sm:grid-cols-2 ${card}`}>
            <Field label="Client">
              <Select value={form.customerId} onChange={set("customerId")} required disabled={clientFixed}>
                <option value="">Choose a client…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title">
              <TextInput value={form.title} onChange={set("title")} required maxLength={120} placeholder="Grace & John wedding" />
            </Field>
          </div>
        ) : null}

        {steps.step === 1 ? (
          <div className={card}>
            <WhenFields value={when} onChange={setWhen} dateLabel="Date" dateRequired exceptBookingId={booking?.id ?? null} bookingsPath={basePath} />
            <Field label="Location">
              <TextInput value={form.location} onChange={set("location")} maxLength={200} />
            </Field>
          </div>
        ) : null}

        {steps.step === 2 ? (
          <div className={card}>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="What was agreed">
              {(
                [
                  ["package", "One of our packages", "At its price, with a discount if you agreed one."],
                  ["custom", "Custom request", "Something the client wants that isn't packaged, at the price you agree."],
                ] as const
              ).map(([mode, label, hint]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={deal.mode === mode}
                  disabled={mode === "package" && packages.length === 0}
                  onClick={() => setDeal((d) => ({ ...d, mode }))}
                  className={`rounded-xl border p-3 text-left text-sm disabled:opacity-50 ${
                    deal.mode === mode ? "border-brand-500 bg-brand-50 dark:bg-brand-500/15" : "border-border hover:bg-background"
                  }`}
                >
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </button>
              ))}
            </div>
            {deal.mode === "package" ? (
              <>
                <Field label="Package">
                  <Select value={chosen ? form.packageName : ""} onChange={set("packageName")} required>
                    <option value="">Choose a package…</option>
                    {packages.map((p) => (
                      <option key={p.label} value={p.label}>
                        {p.label} · {money(p.price)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Discount">
                    <Select
                      value={deal.discountKind}
                      onChange={(e) => setDeal((d) => ({ ...d, discountKind: e.target.value as Deal["discountKind"], discountValue: "" }))}
                    >
                      <option value="">None</option>
                      <option value="percent">% off</option>
                      <option value="amount">{scope.currency} off</option>
                    </Select>
                  </Field>
                  {deal.discountKind ? (
                    <Field label={deal.discountKind === "percent" ? "Percent off" : `Amount off (${scope.currency})`}>
                      <TextInput
                        value={deal.discountValue}
                        onChange={(e) => setDeal((d) => ({ ...d, discountValue: e.target.value }))}
                        inputMode="numeric"
                        required
                      />
                    </Field>
                  ) : null}
                </div>
                {chosen ? (
                  <p className="rounded-xl bg-background p-3 text-sm">
                    {money(chosen.price)}
                    {discount && Number.isFinite(agreed) ? ` − ${money(chosen.price - agreed)} discount` : ""} ={" "}
                    <span className="font-semibold tnum">{Number.isFinite(agreed) ? money(agreed) : "—"}</span> agreed
                  </p>
                ) : null}
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="What the client wants">
                  <TextInput value={form.packageName} onChange={set("packageName")} required maxLength={200} placeholder="Half-day family shoot at home" />
                </Field>
                <Field label={`Agreed price (${scope.currency})`}>
                  <TextInput value={form.amount} onChange={set("amount")} inputMode="numeric" required />
                </Field>
              </div>
            )}
            <Field label="Notes">
              <TextArea value={form.notes} onChange={set("notes")} maxLength={2000} rows={3} />
            </Field>
            {/* A last look at the earlier steps; the indicator opens any of them to change it. */}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
              <dt className="text-muted">Client</dt>
              <dd className="font-medium">{clientName}</dd>
              <dt className="text-muted">Title</dt>
              <dd>{form.title || "—"}</dd>
              <dt className="text-muted">When</dt>
              <dd>{when.date ? `${formatDay(scope, when.date)}, ${timeSpan(whenTimes(when))}` : "—"}</dd>
              <dt className="text-muted">Where</dt>
              <dd>{form.location || "—"}</dd>
              <dt className="text-muted">{deal.mode === "package" ? "Package" : "Custom"}</dt>
              <dd>
                {form.packageName || "—"}
                {Number.isFinite(agreed) ? ` · ${money(agreed)}` : ""}
              </dd>
            </dl>
          </div>
        ) : null}

        {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
        <StepActions first={steps.step === 0} last={steps.last} onBack={steps.back} submitLabel={booking ? "Save changes" : "Book"} pending={pending} />
      </form>
    </div>
  );
}
