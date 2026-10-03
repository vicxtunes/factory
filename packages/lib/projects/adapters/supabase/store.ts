import "server-only";

// This app's ProjectStore: projects, project_events, projects_create() and
// projects_set_status() (supabase/migrations/20261003160000_projects.sql).
// Service-role client, so every query here filters by the scope's tenant;
// composite keys also make the database refuse another studio's client or booking.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { Project, ProjectEvent, ProjectInput, ProjectStatus } from "../../core/model";
import { ProjectError, type ProjectStore } from "../../ports";

interface Row {
  id: string;
  customer_id: string;
  booking_id: string | null;
  title: string;
  event_date: string | null;
  notes: string | null;
  photos_url: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  customer: { name: string } | null;
}

interface EventRow {
  id: string;
  kind: ProjectEvent["kind"];
  from_status: ProjectStatus | null;
  to_status: ProjectStatus | null;
  actor_name: string;
  created_at: string;
}

const COLUMNS = `id, customer_id, booking_id, title, event_date, notes, photos_url, status, created_at, updated_at,
  customer:customers!projects_tenant_id_customer_id_fkey (name)`;

const toProject = (r: Row): Project => ({
  id: r.id,
  customerId: r.customer_id,
  customerName: r.customer?.name ?? "",
  bookingId: r.booking_id,
  title: r.title,
  eventDate: r.event_date,
  notes: r.notes,
  photosUrl: r.photos_url,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function fail(what: string, error: { code?: string; message: string }): never {
  if (error.message.includes("PROJECTS:already_started") || (error.code === "23505" && error.message.includes("one_per_booking"))) {
    throw new ProjectError("This booking already has a project.");
  }
  // A client or booking from another studio: the composite keys caught it.
  if (error.code === "23503") throw new ProjectError("That client or booking doesn't belong to your studio.");
  throw new Error(`projects: could not ${what}: ${error.message}`);
}

const table = () => createAdminClient().from("projects");

export const supabaseProjectStore: ProjectStore = {
  async list(scope, filter) {
    let query = table().select(COLUMNS).eq("tenant_id", scope.tenantId);
    if (filter.customerId) query = query.eq("customer_id", filter.customerId);
    const { data, error } = await query.returns<Row[]>();
    if (error) fail("list projects", error);
    return data.map(toProject);
  },

  async get(scope, id) {
    const { data, error } = await table().select(COLUMNS).eq("tenant_id", scope.tenantId).eq("id", id).maybeSingle<Row>();
    if (error) fail("load the project", error);
    return data ? toProject(data) : null;
  },

  async events(scope, projectId) {
    const { data, error } = await createAdminClient()
      .from("project_events")
      .select("id, kind, from_status, to_status, actor_name, created_at")
      .eq("tenant_id", scope.tenantId)
      .eq("project_id", projectId)
      .order("created_at")
      .returns<EventRow[]>();
    if (error) fail("load the project's history", error);
    return data.map((e) => ({ id: e.id, kind: e.kind, from: e.from_status, to: e.to_status, actorName: e.actor_name, at: e.created_at }));
  },

  async idForBooking(scope, bookingId) {
    const { data, error } = await table().select("id").eq("tenant_id", scope.tenantId).eq("booking_id", bookingId).maybeSingle<{ id: string }>();
    if (error) fail("look up the project", error);
    return data?.id ?? null;
  },

  async create(scope, input, actorName) {
    const { data, error } = await createAdminClient().rpc("projects_create", {
      p_tenant: scope.tenantId,
      p_customer: input.customerId,
      p_booking: input.bookingId,
      p_title: input.title,
      p_event_date: input.eventDate,
      p_notes: input.notes,
      p_actor: actorName,
    });
    if (error) fail("start the project", error);
    return data as string;
  },

  async update(scope, id, input: ProjectInput) {
    const { data, error } = await table()
      // Named one by one: nothing else a caller passes reaches the table.
      .update({ customer_id: input.customerId, title: input.title, event_date: input.eventDate, notes: input.notes, photos_url: input.photosUrl })
      .eq("tenant_id", scope.tenantId)
      .eq("id", id)
      .select("id");
    if (error) fail("save the project", error);
    return data.length === 1;
  },

  async setStatus(scope, id, from, to, actorName) {
    const { data, error } = await createAdminClient().rpc("projects_set_status", {
      p_tenant: scope.tenantId,
      p_project: id,
      p_from: from,
      p_to: to,
      p_actor: actorName,
    });
    if (error) fail("move the project", error);
    return data === true;
  },
};
