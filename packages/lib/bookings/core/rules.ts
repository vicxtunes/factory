// What can happen to a booking, and when two bookings clash. Pure.

import type { Booking, BookingStatus } from "./model";

const MOVES: Record<BookingStatus, BookingStatus[]> = {
  tentative: ["confirmed", "cancelled"],
  confirmed: ["completed", "tentative", "cancelled"],
  completed: [],
  cancelled: ["tentative"],
};

/** The statuses a booking can move to from `from`. Completed is final; cancelled can be reopened. */
export function nextStatuses(from: BookingStatus): BookingStatus[] {
  return MOVES[from];
}

export function canMoveBooking(from: BookingStatus, to: BookingStatus): boolean {
  return MOVES[from].includes(to);
}

/** Details can change until it's completed or cancelled. */
export function canEditBooking(status: BookingStatus): boolean {
  return status === "tentative" || status === "confirmed";
}

/**
 * Same day, neither cancelled, and their times overlap. An all-day booking
 * overlaps everything that day. Touching ends (10:00–12:00, 12:00–14:00) don't clash.
 */
export function clashes(
  a: Pick<Booking, "id" | "date" | "startTime" | "endTime" | "status">,
  b: Pick<Booking, "id" | "date" | "startTime" | "endTime" | "status">,
): boolean {
  if (a.id === b.id || a.date !== b.date || a.status === "cancelled" || b.status === "cancelled") return false;
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return true;
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/** Earliest first: by day, then all-day before timed, then start time. */
export function byTime(a: Pick<Booking, "date" | "startTime">, b: Pick<Booking, "date" | "startTime">): number {
  return a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "");
}
