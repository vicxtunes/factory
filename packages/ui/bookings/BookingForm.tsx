"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import { StepActions, StepIndicator, useSteps } from "@repo/ui/Stepper";
import { createBooking, updateBooking } from "@repo/lib/bookings/actions";
import type { Booking, BookingDraft } from "@repo/lib/bookings/core";
import { formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { timeSpan } from "./BookingBits";
import { WhenFields, whenTimes, type When } from "./WhenFields";

const STEPS = ["Client", "When & where", "Package & review"];
const card = "space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5";

/**
 * Books a client (no `booking`) or changes a booking's details, in steps: the
 * client and a title; the day, times (with the clash warning) and where; then
 * the package, amount and notes with a last look. A booking can start from an
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
  /** Packages to pick from, with their prices (the field also takes anything typed). */
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

  // Picking a package fills in its price, unless a different amount was typed (one from the previous package follows the new one).
  const pickPackage = (packageName: string) =>
    setForm((f) => {
      const priceOf = (name: string) => packages.find((p) => p.label === name)?.price;
      const picked = priceOf(packageName);
      const untouched = f.amount.trim() === "" || f.amount === String(priceOf(f.packageName));
      return { ...f, packageName, amount: picked !== undefined && untouched ? String(picked) : f.amount };
    });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Next (the browser has checked this step's fields), or on the last step, save.
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!steps.last) return steps.next();
    const input = {
      customerId: form.customerId,
      title: form.title,
      date: when.date,
      ...whenTimes(when),
      location: form.location,
      packageName: form.packageName,
      // Empty = no amount; anything else must be a number (refused by the server otherwise).
      amount: form.amount.trim() === "" ? null : Number(form.amount.replace(/[,\s]/g, "")),
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Package">
                <TextInput value={form.packageName} onChange={(e) => pickPackage(e.target.value)} maxLength={200} list="booking-packages" />
                <datalist id="booking-packages">
                  {packages.map((p) => (
                    <option key={p.label} value={p.label} />
                  ))}
                </datalist>
              </Field>
              <Field label={`Amount (${scope.currency})`} hint="The package's price, filled in; change it if you agreed another.">
                <TextInput value={form.amount} onChange={set("amount")} inputMode="numeric" />
              </Field>
            </div>
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
            </dl>
          </div>
        ) : null}

        {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
        <StepActions first={steps.step === 0} last={steps.last} onBack={steps.back} submitLabel={booking ? "Save changes" : "Book"} pending={pending} />
      </form>
    </div>
  );
}
