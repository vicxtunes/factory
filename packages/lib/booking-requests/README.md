# Booking requests module

Clients book a studio's package themselves, and the studio answers. No WhatsApp, no password, no
PIN.

## The client

1. On a service's page (`/<studio>/s/<service>`), **Book now** (or "Book Gold now" when a package
   is picked) opens a few steps: the **package**, the **day**, their **name and phone** (skipped when
   they're signed in at the studio), a last look, **Send booking request**.
2. It goes straight to the studio as a booking in a new status, **Requested**, and the owner gets a
   push notification.
3. **A new client** (phone the studio doesn't know) is added to the studio's clients and **this
   device is signed in to their page for good** (`/<studio>/me`): their request, then the
   confirmed booking, its invoice and its project.
4. **A number the studio already knows** still books, but signs nothing in: anyone could type a
   client's number and see their invoices and photos. This device remembers the request (a signed
   cookie) and the showroom shows how it stands; the studio sends the link to their page when it
   confirms (below).

Limits: the package and service must be on sale, the day today or later, and a client can have at
most 3 requests waiting at a studio.

## The studio

- **Dashboard → Booking requests (n)** lists them until they're answered; the calendar shows them too.
- A request's page: **Confirm request** or **Decline**.
  - **Confirm**: the booking is confirmed, the **invoice** for the package is made (due on the day;
    none for a package priced 0, "on request") and linked to the booking, and its **project** starts;
    the project opens. Safe to tap twice: a request confirmed before only gets what it's missing.
  - **Decline**: the booking is cancelled.
  - **Send link to their page**: for a client who booked from a phone that isn't signed in. One tap on
    the link signs that phone in for good, no PIN.
- A requested booking can't be confirmed by a plain status change: only through Confirm, so it always
  gets its invoice and project.

## Signing in without a PIN

- Each client has a **PIN-free access time** (`customers.portal_access_at`). A device signed in by
  booking, or by the studio's link, carries it in the studio's cookie; changing it signs all such
  devices out.
- The cookie lasts as long as browsers allow (400 days) and **every visit renews it**
  (`PortalStayIn`), so a client stays signed in for good.
- Clients who set a PIN earlier can still sign in with phone + PIN ("I have a PIN"); no new PINs are
  set.

## Layout

```
packages/lib/booking-requests/
  core.ts           bookNowSchema (package, day, name, phone in its stored form), MAX_OPEN_REQUESTS.
  service.ts        class BookingRequestService: request, confirm, decline, over BookingRequestDeps.
  service.test.ts   The orchestration against fakes.
  server.ts         The service wired to offerings, customers, bookings, billing, projects,
                    studio-portal and push; the device's remembered requests.
  actions.ts        bookNow (public, by the studio's address), confirmBookingRequest,
                    declineBookingRequest (the owner).
apps/client/app/book-now.tsx              The Book now steps.
packages/ui/bookings/RequestAnswer.tsx    Confirm / Decline on a request.
supabase/migrations/20261008100000_booking_requests.sql
```

## Testing

- `npm test`: a new client signed in, a known number not; signed-in clients book as themselves;
  refusals (off sale, past day, missing details, too many waiting); confirm makes one invoice and one
  project and is safe to repeat; no invoice for a 0 price; decline; answered requests stay answered.
- In a browser against a copy of the data: a new client books on a phone and lands on their page;
  the studio sees the request, confirms it and lands on the project; the client's page then shows the
  confirmed booking, its invoice and project; the same client on a new phone books without being
  signed in and sees the request on the showroom; the studio's link signs that phone in.
