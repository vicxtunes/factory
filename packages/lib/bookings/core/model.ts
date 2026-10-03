// The bookings module's records. Pure; safe on client and server.
//
// A booking is a business's appointment with a customer: a shoot, a session,
// an event. Days are calendar days ("yyyy-mm-dd") and times are clock times
// ("HH:MM"), both in the business's own time zone, so nothing shifts.

export type BookingStatus = "tentative" | "confirmed" | "completed" | "cancelled";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  tentative: "Tentative",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** What the business fills in. */
export interface BookingInput {
  customerId: string;
  title: string;
  date: string;
  /** Both null = all day. */
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  /** What was agreed, e.g. a package's name (copied, never linked). */
  packageName: string | null;
  /** Whole units of the business's currency. */
  amount: number | null;
  notes: string | null;
  /** The accepted quotation it's booked from (set on create only). */
  quotationId: string | null;
}

export interface Booking extends Omit<BookingInput, "quotationId"> {
  id: string;
  customerName: string;
  status: BookingStatus;
  quotationId: string | null;
  createdAt: string;
}

/** A booking's page: the booking, and others the same day that overlap it. */
export interface BookingView {
  booking: Booking;
  clashes: Booking[];
}

/** What a booking form can start from: an accepted quotation, pre-filled. */
export interface BookingDraft {
  customerId: string;
  title: string;
  packageName: string | null;
  amount: number;
  quotationId: string;
}

export type CalendarView = "month" | "week" | "day" | "list";
