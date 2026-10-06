import "server-only";

// The booking-request service wired to the app's modules, and the cookie
// that lets a device follow the requests it sent while it isn't signed in
// to the client's page (a returning client on a new device).

import { localDate } from "@repo/lib/accounting/core/period";
import { invoices } from "@repo/lib/billing/server";
import type { Booking } from "@repo/lib/bookings/core";
import { bookings } from "@repo/lib/bookings/server";
import { customers } from "@repo/lib/customers/server";
import { offerings } from "@repo/lib/offerings/server";
import { projects } from "@repo/lib/projects/server";
import { notifyActor } from "@repo/lib/push/send";
import { rememberedOnDevice } from "@repo/lib/studio-portal/remembered";
import { portal } from "@repo/lib/studio-portal/server";
import { studios } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { BookingRequestService } from "./service";

export const bookingRequests = new BookingRequestService({
  service: (scope, slug) => offerings.publicService(scope, slug, "service"),
  package: (scope, id) => offerings.package(scope, id),
  client: async (scope, { name, phone }) => {
    const outcome = await customers.create(scope, { name, phone, email: null, notes: null });
    return "saved" in outcome ? { id: outcome.saved.id, isNew: true } : { id: outcome.duplicateOf.id, isNew: false };
  },
  openRequests: async (scope, customerId) => (await bookings.forCustomer(scope, customerId)).filter((b) => b.status === "requested").length,
  booking: async (scope, id) => (await bookings.get(scope, id))?.booking ?? null,
  createRequest: (scope, input) => bookings.request(scope, input),
  confirm: async (scope, id) => void (await bookings.confirmRequest(scope, id)),
  decline: (scope, id) => bookings.setStatus(scope, id, "cancelled"),
  createInvoice: (scope, input) => invoices.create(scope, input),
  linkInvoice: (scope, bookingId, invoiceId) => bookings.setInvoice(scope, bookingId, invoiceId),
  startProject: (scope, bookingId, actorName) => projects.startFromBooking(scope, bookingId, { name: actorName }),
  openDevice: (tenantId, customerId) => portal.openDevice(tenantId, customerId),
  notifyOwner: async (scope, { title, body }) => {
    const studio = await studios.get(scope.tenantId);
    if (studio) await notifyActor({ type: "client", id: studio.ownerClientId }, { title, body, url: "/studio/bookings" }).catch(() => {});
  },
  today: (scope) => localDate(new Date(), scope.timeZone),
});

// --- Requests sent from a device that isn't signed in -------------------------

const remembered = rememberedOnDevice("sbr");

/** Remembers on this device a request it sent, so the studio's page can show how it's going. */
export async function rememberRequest(tenantId: string, bookingId: string): Promise<void> {
  await remembered.add(tenantId, bookingId);
}

/** The requests this device sent to the studio, newest first, as they stand now. */
export async function rememberedRequests(scope: TenantScope): Promise<Booking[]> {
  const found = await Promise.all((await remembered.ids(scope.tenantId)).map((id) => bookings.get(scope, id)));
  return found.flatMap((view) => (view && view.booking.source === "online" ? [view.booking] : []));
}
