import "server-only";

// This app's BookingStore: the bookings table
// (supabase/migrations/20261003150000_bookings.sql). Service-role client, so
// every query here filters by the scope's tenant; the database's composite
// keys also refuse another studio's client or quotation.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Booking, BookingInput, BookingStatus } from "../../core/model";
import { BookingError, type BookingStore } from "../../ports";

interface Row {
  id: string;
  customer_id: string;
  title: string;
  starts_on: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  package_name: string | null;
  amount: number | string | null;
  notes: string | null;
  status: BookingStatus;
  source: Booking["source"];
  quotation_id: string | null;
  offering_id: string | null;
  invoice_id: string | null;
  created_at: string;
  customer: { name: string } | null;
}

const COLUMNS = `id, customer_id, title, starts_on, start_time, end_time, location, package_name, amount, notes, status,
  source, quotation_id, offering_id, invoice_id, created_at, customer:customers!bookings_tenant_id_customer_id_fkey (name)`;

/** Postgres gives "14:00:00"; the app speaks "14:00". */
const clock = (t: string | null) => (t ? t.slice(0, 5) : null);

const toBooking = (r: Row): Booking => ({
  id: r.id,
  customerId: r.customer_id,
  customerName: r.customer?.name ?? "",
  title: r.title,
  date: r.starts_on,
  startTime: clock(r.start_time),
  endTime: clock(r.end_time),
  location: r.location,
  packageName: r.package_name,
  // bigint may arrive as a string.
  amount: r.amount == null ? null : Number(r.amount),
  notes: r.notes,
  status: r.status,
  source: r.source,
  quotationId: r.quotation_id,
  offeringId: r.offering_id,
  invoiceId: r.invoice_id,
  createdAt: r.created_at,
});

/** The writable columns, named one by one. */
const toColumns = (b: Omit<BookingInput, "quotationId">) => ({
  customer_id: b.customerId,
  title: b.title,
  starts_on: b.date,
  start_time: b.startTime,
  end_time: b.endTime,
  location: b.location,
  package_name: b.packageName,
  amount: b.amount,
  notes: b.notes,
});

function fail(what: string, error: { code?: string; message: string }): never {
  // Booked twice at once: the one-booking-per-quotation index caught it.
  if (error.code === "23505" && error.message.includes("one_per_quotation")) throw new BookingError("This quotation is already booked.");
  // A client, quotation or package from another studio: the composite keys caught it.
  if (error.code === "23503") throw new BookingError("That client, quotation or package doesn't belong to your business.");
  throw new Error(`bookings: could not ${what}: ${error.message}`);
}

const table = () => createAdminClient().from("bookings");

export const supabaseBookingStore: BookingStore = {
  async list(scope, filter) {
    let query = table().select(COLUMNS).eq("tenant_id", scope.tenantId);
    if (filter.from) query = query.gte("starts_on", filter.from);
    if (filter.to) query = query.lte("starts_on", filter.to);
    if (filter.customerId) query = query.eq("customer_id", filter.customerId);
    if (filter.status) query = query.eq("status", filter.status);
    const { data, error } = await query.returns<Row[]>();
    if (error) fail("list bookings", error);
    return data.map(toBooking);
  },

  async get(scope, id) {
    const { data, error } = await table().select(COLUMNS).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<Row>();
    if (error) fail("load the booking", error);
    return data ? toBooking(data) : null;
  },

  async idForQuotation(scope, quotationId) {
    const { data, error } = await table().select("id").eq("tenant_id", scope.tenantId).eq("quotation_id", quotationId).maybeSingle<{ id: string }>();
    if (error) fail("look up the booking", error);
    return data?.id ?? null;
  },

  async create(scope, input) {
    const { data, error } = await table()
      .insert({ ...toColumns(input), quotation_id: input.quotationId, tenant_id: scope.tenantId })
      .select("id")
      .single<{ id: string }>();
    if (error) fail("save the booking", error);
    return data.id;
  },

  async createRequest(scope, input) {
    const { data, error } = await table()
      .insert({ ...toColumns(input), offering_id: input.offeringId, status: "requested", source: "online", tenant_id: scope.tenantId })
      .select("id")
      .single<{ id: string }>();
    if (error) fail("save the booking request", error);
    return data.id;
  },

  async setInvoice(scope, id, invoiceId) {
    const { data, error } = await table().update({ invoice_id: invoiceId }).eq("tenant_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("link the invoice", error);
    return data.length === 1;
  },

  async update(scope, id, input) {
    const { data, error } = await table().update(toColumns(input)).eq("tenant_id", scope.tenantId).eq("id", id).select("id");
    if (error) fail("save the booking", error);
    return data.length === 1;
  },

  async setStatus(scope, id, from, to) {
    const { data, error } = await table().update({ status: to }).eq("tenant_id", scope.tenantId).eq("id", id).eq("status", from).select("id");
    if (error) fail("change the booking", error);
    return data.length === 1;
  },
};
