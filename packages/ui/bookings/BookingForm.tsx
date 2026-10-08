"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, Select, TextArea, TextInput } from "@repo/ui/Field";
import { createBooking, updateBooking } from "@repo/lib/bookings/actions";
import type { Booking, BookingDraft } from "@repo/lib/bookings/core";

import { WhenFields, whenTimes, type When } from "./WhenFields";

/**
 * Books a client (no `booking`) or changes a booking's details. A booking
 * can start from an accepted quotation (`draft`): its client is then fixed
 * and the package and amount are filled in.
 */
export function BookingForm({
  booking,
  draft,
  date,
  customers,
  packages,
  currency,
  basePath,
}: {
  booking?: Booking;
  draft?: BookingDraft;
  /** Pre-filled day for a new booking, "yyyy-mm-dd". */
  date?: string;
  customers: { id: string; name: string }[];
  /** Package and service names to pick from (the field also takes anything typed). */
  packages: string[];
  currency: string;
  basePath: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    customerId: booking?.customerId ?? draft?.customerId ?? "",
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
  const clientFixed = !!(draft || booking?.quotationId);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
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
      <WhenFields value={when} onChange={setWhen} dateLabel="Date" dateRequired exceptBookingId={booking?.id ?? null} bookingsPath={basePath} />
      <Field label="Location">
        <TextInput value={form.location} onChange={set("location")} maxLength={200} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Package">
          <TextInput value={form.packageName} onChange={set("packageName")} maxLength={200} list="booking-packages" />
          <datalist id="booking-packages">
            {packages.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label={`Amount (${currency})`} hint="Optional: what was agreed.">
          <TextInput value={form.amount} onChange={set("amount")} inputMode="numeric" />
        </Field>
      </div>
      <Field label="Notes">
        <TextArea value={form.notes} onChange={set("notes")} maxLength={2000} rows={3} />
      </Field>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button type="submit" loading={pending}>
        {booking ? "Save changes" : "Book"}
      </Button>
    </form>
  );
}
