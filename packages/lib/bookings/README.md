# Bookings module

A business's appointments with its customers: shoots, sessions, events. For studios it's
**My Business → Bookings**, with a calendar. Generic and tenant-scoped, so a future product
(vendors, service providers) reuses it.

- **A booking has:** a client, a title, a day, a time span (or all day), a location, what was
  agreed (a package's name, copied, and an amount), notes and a status.
- **Days and times are local:** the studio's calendar day (`date`) and clock time (`time`), stored
  as such, so nothing shifts between time zones. Calendar maths (`core/calendar.ts`) works on
  `"yyyy-mm-dd"` strings.
- **Requested:** a client's own booking from a service's page (packages/lib/booking-requests),
  waiting for the studio: Confirm (with its invoice and project) or Decline. It's never confirmed by
  a plain status change.
- **Status:** Pending → Confirmed → Completed. "Pending" (stored as `tentative`) means the date is
  held but not yet confirmed. Pending and confirmed can be cancelled, and a
  cancelled booking can be reopened. **Completed is final.** Details can change only while
  pending or confirmed (`core/rules.ts`). Status moves are guarded in the store too: a move
  happens only if the booking is still in the status the service saw.
- **What was agreed:** the booking form asks for one of the studio's packages, at its price with
  a discount if one was agreed (% or an amount off; the booking keeps the price after it), or a
  **custom request** the studio hasn't packaged, described and priced by hand. A quotation or
  invoice made from the booking shows the package at its price with the discount on the line, or
  the custom request at its agreed price.
- **Times are always chosen:** every form that leads to a booking asks for the start and end time
  (or All day, for the studio's own forms). A new booking's times start empty, never assumed.
  Clients booking online give a start and end time.
- **Clashes warn, never block:** as soon as a form has a day and times (the booking form, a
  quotation's or invoice's shoot), it lists the studio's bookings they'd overlap (`findClashes`),
  and a booking's page lists them too. All day overlaps everything, touching ends don't clash, and
  cancelled bookings never clash. A studio may run two shoots with two teams. Clients never see
  other clients' bookings.
- **Booked automatically** (`bookInvoice`, `bookAcceptedQuotation`, `cancelForInvoice`, called from
  packages/lib/billing/actions.ts). Quotations and invoices can say when their shoot is (a day and
  times, or all day):
  - **An invoice with a shoot day** is booked when it's saved: confirmed, for its client, titled
    "Client: first line", at its total. Saving it again with another day or time moves its booking
    (while the booking can change); saving it without one leaves the booking where it is.
  - **A quotation with a shoot day** is booked when the client accepts it: pending.
  - **The invoice made from that quotation** takes over its booking and confirms it: never a second.
  - **Voiding an invoice** cancels its booking (a completed one stays).
  - **A client's online request**, once confirmed, gets an invoice saying when it is.
  - With no shoot day, nothing is booked automatically: "Book it" on an accepted quotation, or the
    booking form, still work.
- **The next document, where it's due:** a booking's page has a **Documents** box offering what
  comes next, filled in from the booking (its client, fixed; its day and times; its package and
  amount as the one line):
  - **Create quotation** while it's pending: saved, it's that booking's quotation (`setQuotation`),
    so the client accepting it books nothing new.
  - **Create invoice** while it's pending or confirmed: saved, it's that booking's invoice and
    confirms it (moved to the invoice's shoot day, at its total). Once its quotation is accepted,
    it's made from the quotation instead, in one tap.
  - Otherwise each document's number and status, linked. A client's request gets its invoice when
    it's confirmed, as before. The same **Create invoice** shows on a booked project without one,
    and a client's page has **New booking** next to New quotation and New invoice.
- **Book an accepted quotation** ("Book it" on the quotation): the form opens with the client
  (fixed), the first line as the package, the quotation's total as the amount, and a title. One
  booking per quotation. Its page links back to the quotation and shows the invoice made from it,
  with paid and status, so you can see the deposit before confirming.

## Screens

| Screen | Who | What |
| --- | --- | --- |
| `/studio/bookings?view=month\|week\|day\|list&date=…` | Studio owner | Calendar. Server-rendered, so every view and step is a plain link |
| `/studio/bookings/new` (`?date=`, `?quotation=`) | Studio owner | Book; from a quotation, pre-filled; clash warning as you choose the time |
| `/studio/quotations/new`, `/studio/invoices/new` (and edit) | Studio owner | Shoot day and times, with the clash warning: what books it |
| `/studio/bookings/<id>` | Studio owner | Details, clashes, its quotation and invoice, confirm / complete / cancel / reopen |
| `/studio/bookings/<id>/edit` | Studio owner | Change the details |
| `/studio` (dashboard), `/studio/clients/<id>` | Studio owner | Coming up; a client's bookings |
| `/dashboard/studios/<id>` (factory app) | Boss | The studio's coming bookings, read-only |

## Studio separation

- The tenant comes from the caller's studio (`studioOfCaller()`), never the browser. Every store
  query filters by it.
- **The database itself refuses another studio's client or quotation:** `bookings` references
  `customers (tenant_id, id)` and `billing_documents (tenant_id, id)` with composite foreign keys.
  This migration adds the `(tenant_id, id)` unique keys they point at.
- `tenant_id` has no default, row-level security with no policies, no grants to `anon` /
  `authenticated`. The adapter names every column it writes.

## Layout

```
packages/lib/bookings/
  core/
    model.ts       Booking, BookingInput, BookingDraft, statuses, CalendarView.
    rules.ts       nextStatuses, canMoveBooking, canEditBooking, clashes, byTime.
    calendar.ts    addDays, startOfWeek (Monday), addMonths, viewRange, stepAnchor, daysBetween.
    schema.ts      zod: booking input (both times or neither, end after start), status, view.
    core.test.ts
  ports.ts         BookingStore, BookingDirectory (customers, accepted quotations), BookingError.
  service.ts       class BookingService: between, upcoming, forCustomer, get (+ clashes),
                   idForQuotation, draftFromQuotation, create, update, setStatus.
  service.test.ts  In-memory adapters, studio separation included.
  adapters/supabase/store.ts, directory.ts
  server.ts, actions.ts   createBooking, updateBooking, setBookingStatus.
packages/ui/bookings/  BookingsCalendar, BookingForm, BookingStatusButtons,
                       BookingBits (status badge, list, time span),
                       WhenFields (day, times or all day, and the clash warning).
supabase/migrations/20261003150000_bookings.sql
supabase/migrations/20261011100000_shoot_bookings.sql   quotations' and invoices' shoot day and times
```

## Testing

- `npm test`:
  - Calendar maths: month ends, weeks starting Monday, whole-week months, stepping.
  - Clashes: overlap, touching ends, all day, cancelled, not with itself.
  - Ordering, status moves, input rules.
  - The service: clashes on a booking's page, booking a quotation once with its own client,
    status moves and locking, reopening, client changes, upcoming, and studio separation.
- Against Postgres through PostgREST:
  - **The database refuses another studio's client and quotation** (composite keys).
  - Time-span checks, and `anon` denied.
  - Times round-trip as `HH:MM`, and client names come through the new key.
  - Clashes and all day; calendar ranges and ordering.
  - Status guarded against stale moves.
  - Booking a quotation pre-filled and once (service and unique index).
  - Every cross-studio path refused.
