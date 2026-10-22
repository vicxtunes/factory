import "server-only";

// This app's VendorJobStore: the `vendor_jobs` table, and the money moved by
// vendor_job_fund(), vendor_job_release() and vendor_job_refund()
// (supabase/migrations/20261112100000_vendor_job_escrow.sql). Service-role client.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { JobView, VendorJob } from "../../core/jobs";
import { VendorError, type VendorJobStore } from "../../ports";

interface Row {
  id: string;
  tenant_id: string;
  project_id: string | null;
  vendor_id: string;
  kind: VendorJob["kind"];
  item: string | null;
  quantity: number | null;
  starts_on: string | null;
  ends_on: string | null;
  handed_over_at: string | null;
  folder_id: string | null;
  brief: string;
  samples_wanted: string | null;
  due_on: string | null;
  price: number | string;
  status: VendorJob["status"];
  fee: number | string | null;
  requested_by_name: string;
  created_at: string;
  delivered_at: string | null;
  funded_at: string | null;
  disputed_by: VendorJob["disputedBy"];
  dispute_reason: string | null;
  overdue_alerted_at: string | null;
}

type ViewRow = Row & {
  vendor: { name: string; category: string; client_id: string; photo_key: string | null };
  studio: { name: string; owner_client_id: string | null };
  project: { title: string } | null;
};

const COLUMNS =
  "id, tenant_id, project_id, vendor_id, kind, item, quantity, starts_on, ends_on, handed_over_at, folder_id, brief, samples_wanted, due_on, price, status, fee, requested_by_name, created_at, delivered_at, funded_at, disputed_by, dispute_reason, overdue_alerted_at";
// Linked twice to tenants' side (the studio, and its project): name the ones meant.
const VIEW = `${COLUMNS}, vendor:vendors!vendor_jobs_vendor_id_fkey (name, category, client_id, photo_key), studio:tenants!vendor_jobs_tenant_id_fkey (name, owner_client_id), project:projects!vendor_jobs_tenant_id_project_id_fkey (title)`;

const toJob = (r: Row): VendorJob => ({
  id: r.id,
  tenantId: r.tenant_id,
  projectId: r.project_id,
  vendorId: r.vendor_id,
  kind: r.kind,
  rental: r.kind === "rental" && r.item && r.quantity && r.starts_on && r.ends_on ? { item: r.item, quantity: r.quantity, startsOn: r.starts_on, endsOn: r.ends_on } : null,
  handedOverAt: r.handed_over_at,
  folderId: r.folder_id,
  brief: r.brief,
  samplesWanted: r.samples_wanted,
  dueOn: r.due_on,
  // bigint may arrive as a string.
  price: Number(r.price),
  status: r.status,
  fee: r.fee == null ? null : Number(r.fee),
  requestedByName: r.requested_by_name,
  createdAt: r.created_at,
  deliveredAt: r.delivered_at,
  fundedAt: r.funded_at,
  disputedBy: r.disputed_by,
  disputeReason: r.dispute_reason,
  overdueAlertedAt: r.overdue_alerted_at,
});

const toView = (r: ViewRow): JobView => ({
  ...toJob(r),
  vendor: { name: r.vendor.name, category: r.vendor.category, clientId: r.vendor.client_id, photoKey: r.vendor.photo_key },
  studio: { name: r.studio.name, ownerClientId: r.studio.owner_client_id },
  projectTitle: r.project?.title ?? null,
});

function fail(what: string, error: { code?: string; message: string }): never {
  if (error.message.includes("WALLET:insufficient_funds")) throw new VendorError("There isn't enough on your Business card to pay this in. Add money to it, then try again.");
  if (error.message.includes("VENDORS:not_now")) throw new VendorError("This job has moved on: reload to see where it is.");
  if (error.message.includes("VENDORS:no_job")) throw new VendorError("That job doesn't exist.");
  throw new Error(`vendors: could not ${what}: ${error.message}`);
}

const jobs = () => createAdminClient().from("vendor_jobs");

export const supabaseJobStore: VendorJobStore = {
  async create(tenantId, request, folderId, requestedByName) {
    const { data, error } = await jobs()
      .insert({
        tenant_id: tenantId,
        project_id: request.projectId,
        vendor_id: request.vendorId,
        kind: request.rental ? "rental" : "service",
        item: request.rental?.item ?? null,
        quantity: request.rental?.quantity ?? null,
        starts_on: request.rental?.startsOn ?? null,
        ends_on: request.rental?.endsOn ?? null,
        folder_id: folderId,
        brief: request.brief,
        samples_wanted: request.samplesWanted,
        due_on: request.dueOn,
        price: request.price,
        requested_by_name: requestedByName,
      })
      .select(COLUMNS)
      .single<Row>();
    if (error?.code === "23505") throw new VendorError("This vendor already has a job open on this project.");
    // Another studio's project: the composite key refuses it.
    if (error?.code === "23503") throw new VendorError("That project no longer exists.");
    if (error) fail("send the request", error);
    return toJob(data);
  },

  async get(id) {
    const { data, error } = await jobs().select(VIEW).eq("id", id).maybeSingle<ViewRow>();
    if (error) fail("load the job", error);
    return data ? toView(data) : null;
  },

  async forVendor(vendorId) {
    const { data, error } = await jobs().select(VIEW).eq("vendor_id", vendorId).order("created_at", { ascending: false }).limit(100).returns<ViewRow[]>();
    if (error) fail("list the jobs", error);
    return data.map(toView);
  },

  async forStudio(tenantId) {
    const { data, error } = await jobs().select(VIEW).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200).returns<ViewRow[]>();
    if (error) fail("list the studio's vendor jobs", error);
    return data.map(toView);
  },

  async forProject(tenantId, projectId) {
    const { data, error } = await jobs().select(VIEW).eq("tenant_id", tenantId).eq("project_id", projectId).order("created_at", { ascending: false }).returns<ViewRow[]>();
    if (error) fail("list the project's vendors", error);
    return data.map(toView);
  },

  async needingAttention() {
    const { data, error } = await jobs().select(VIEW).in("status", ["delivered", "disputed"]).order("delivered_at").returns<ViewRow[]>();
    if (error) fail("list the jobs needing attention", error);
    return data.map(toView);
  },

  async move(id, from, to, dispute) {
    const now = new Date().toISOString();
    const stamp =
      to === "samples_sent"
        ? { samples_sent_at: now }
        : to === "delivered"
          ? { delivered_at: now }
          : to === "disputed"
            ? { disputed_at: now, disputed_by: dispute?.by, dispute_reason: dispute?.reason }
            : ["samples", "awaiting_funds", "declined"].includes(to)
              ? { responded_at: now }
              : {};
    const { data, error } = await jobs().update({ status: to, ...stamp }).eq("id", id).in("status", from).select(COLUMNS).maybeSingle<Row>();
    if (error) fail("update the job", error);
    return data ? toJob(data) : null;
  },

  async fund(tenantId, id, actor) {
    const { error } = await createAdminClient().rpc("vendor_job_fund", { p_tenant: tenantId, p_job: id, p_actor_id: actor.id, p_actor_name: actor.name });
    if (error) fail("pay the job in", error);
  },

  async release(id, actor) {
    const { error } = await createAdminClient().rpc("vendor_job_release", { p_job: id, p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name });
    if (error) fail("release the money", error);
  },

  async refund(id, actor) {
    const { error } = await createAdminClient().rpc("vendor_job_refund", { p_job: id, p_actor_type: actor.type, p_actor_id: actor.id, p_actor_name: actor.name });
    if (error) fail("refund the money", error);
  },

  async setFolder(tenantId, id, folderId) {
    const { data, error } = await jobs()
      .update({ folder_id: folderId })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .in("status", ["requested", "samples", "samples_sent", "awaiting_funds", "in_progress", "delivered", "disputed"])
      .select("id")
      .maybeSingle();
    if (error) fail("set the job's folder", error);
    return data !== null;
  },

  async handOver(id) {
    const { data, error } = await jobs()
      .update({ handed_over_at: new Date().toISOString() })
      .eq("id", id)
      .eq("kind", "rental")
      .eq("status", "in_progress")
      .is("handed_over_at", null)
      .select("id");
    if (error) fail("note the hand-over", error);
    return data.length > 0;
  },

  async setDueOn(id, dueOn) {
    const { error } = await jobs().update({ due_on: dueOn }).eq("id", id).eq("status", "requested");
    if (error) fail("set the due date", error);
  },

  async markWarned(id) {
    const { error } = await jobs().update({ overdue_alerted_at: new Date().toISOString() }).eq("id", id).is("overdue_alerted_at", null);
    if (error) fail("note the warning", error);
  },
};
