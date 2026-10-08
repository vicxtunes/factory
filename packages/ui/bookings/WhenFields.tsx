"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Field, TextInput } from "@repo/ui/Field";
import { findClashes } from "@repo/lib/bookings/actions";
import type { Booking } from "@repo/lib/bookings/core";

import { BookingStatusBadge, timeSpan } from "./BookingBits";

/** A day and its times as a form holds them: times "" until chosen. */
export interface When {
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
}

/** As saved: both times null for all day. */
export const whenTimes = (w: When) => ({ startTime: w.allDay ? null : w.startTime, endTime: w.allDay ? null : w.endTime });

/**
 * When something happens: its day, then its times (required once there's a
 * day) or all day. As soon as they're complete it warns about the studio's
 * bookings they'd clash with (it never blocks: two teams can shoot at once).
 * `exceptBookingId` is the booking being changed, left out of the warning.
 */
export function WhenFields({
  value,
  onChange,
  dateLabel,
  dateRequired,
  dateHint,
  exceptBookingId,
  bookingsPath,
}: {
  value: When;
  onChange: (next: When) => void;
  dateLabel: string;
  dateRequired: boolean;
  dateHint?: string;
  exceptBookingId: string | null;
  bookingsPath: string;
}) {
  const set = (patch: Partial<When>) => onChange({ ...value, ...patch });
  const clashing = useClashes(value, exceptBookingId);

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={dateLabel} hint={dateHint}>
          <TextInput type="date" value={value.date} onChange={(e) => set({ date: e.target.value })} required={dateRequired} />
        </Field>
        {value.date && !value.allDay ? (
          <>
            <Field label="From">
              <TextInput type="time" value={value.startTime} onChange={(e) => set({ startTime: e.target.value })} required />
            </Field>
            <Field label="To">
              <TextInput type="time" value={value.endTime} onChange={(e) => set({ endTime: e.target.value })} required min={value.startTime || undefined} />
            </Field>
          </>
        ) : null}
      </div>
      {value.date ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.allDay} onChange={(e) => set({ allDay: e.target.checked })} />
          All day
        </label>
      ) : null}
      {clashing.length ? (
        <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm dark:border-warning-500/30 dark:bg-warning-500/10">
          <p className="font-medium text-warning-700 dark:text-warning-500">Already booked at this time</p>
          <ul className="mt-1 space-y-1">
            {clashing.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2">
                <span className="tnum text-muted">{timeSpan(b)}</span>
                <Link href={`${bookingsPath}/${b.id}`} target="_blank" className="hover:underline">
                  {b.title}
                </Link>
                <BookingStatusBadge status={b.status} />
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">You can still go ahead, e.g. with a second team.</p>
        </div>
      ) : null}
    </div>
  );
}

/** The bookings a complete day-and-times would clash with, checked a moment after it changes. */
function useClashes(value: When, exceptBookingId: string | null): Booking[] {
  const [clashing, setClashing] = useState<Booking[]>([]);
  const { date, allDay, startTime, endTime } = value;
  const complete = !!date && (allDay || (!!startTime && !!endTime && endTime > startTime));

  useEffect(() => {
    if (!complete) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const res = await findClashes({ date, ...whenTimes({ date, allDay, startTime, endTime }) }, exceptBookingId);
      if (!stale) setClashing(res.ok ? res.data : []);
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [complete, date, allDay, startTime, endTime, exceptBookingId]);

  return complete ? clashing : [];
}
