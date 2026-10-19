import "server-only";

// This app's VendorJobStore: the `vendor_jobs` table and vendor_job_pay()
// (supabase/migrations/20261110100000_vendor_jobs.sql). Service-role client.

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { JobView, VendorJob } from "../../core/jobs";
import { VendorError, type VendorJobStore } from "../../ports";

interface Row {
  id: string;
  tenant_id: string;
  project_id: string;
  vendor_id: string;
  brief: string;
  due_on: string | null;
  price: number | string;
  status: VendorJob["status"];
  fee: number | string | null;
  requested_by_name: string;
  created_at: string;
}

type ViewRow = Row & {
  vendor: { name: string; category: string; client_id: string; photo_key: string | null };
  studio: { name: string; owner_client_id: string | null };
  project: { title: string } | null;
};

const COLUMNS = "id, tenant_id, project_id, vendor_id, brief, due_on, price, status, fee, requested_by_name, created_at";
// Linked twice to tenants' side (the studio, and its project): name the ones meant.
const VIEW = `${COLUMNS}, vendor:vendors!vendor_jobs_vendor_id_fkey (name, category, client_id, photo_key), studio:tenants!vendor_jobs_tenant_id_fkey (name, owner_client_id), project:projects!vendor_jobs_tenant_id_project_id_fkey (title)`;

const toJob = (r: Row): VendorJob => ({
  id: r.id,
  tenantId: r.tenant_id,
  projectId: r.project_id,
  vendorId: r.vendor_id,
  brief: r.brief,
  dueOn: r.due_on,
  // bigint may arrive as a string.
  price: Number(r.price),
  status: r.status,
  fee: r.fee == null ? null : Number(r.fee),
  requestedByName: r.requested_by_name,
  createdAt: r.created_at,
});

const toView = (r: ViewRow): JobView => ({
  ...toJob(r),
  vendor: { name: r.vendor.name, category: r.vendor.category, clientId: r.vendor.client_id, photoKey: r.vendor.photo_key },
  studio: { name: r.studio.name, ownerClientId: r.studio.owner_client_id },
  projectTitle: r.project?.title ?? "A project",
});

function fail(what: string, error: { code?: string; message: string }): never {
  if (error.message.includes("WALLET:insufficient_funds")) throw new VendorError("There isn't enough on your Business card to pay this. Add money to it, then try again.");
  if (error.message.includes("VENDORS:not_delivered")) throw new VendorError("Only delivered work can be paid.");
  if (error.message.includes("VENDORS:no_job")) throw new VendorError("That job doesn't exist.");
  throw new Error(`vendors: could not ${what}: ${error.message}`);
}

const jobs = () => createAdminClient().from("vendor_jobs");

export const supabaseJobStore: VendorJobStore = {
  async create(tenantId, request, requestedByName) {
    const { data, error } = await jobs()
      .insert({
        tenant_id: tenantId,
        project_id: request.projectId,
        vendor_id: request.vendorId,
        brief: request.brief,
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

  async forProject(tenantId, projectId) {
    const { data, error } = await jobs().select(VIEW).eq("tenant_id", tenantId).eq("project_id", projectId).order("created_at", { ascending: false }).returns<ViewRow[]>();
    if (error) fail("list the project's vendors", error);
    return data.map(toView);
  },

  async move(id, from, to) {
    const stamp = to === "accepted" || to === "declined" ? { responded_at: new Date().toISOString() } : to === "delivered" ? { delivered_at: new Date().toISOString() } : {};
    const { data, error } = await jobs().update({ status: to, ...stamp }).eq("id", id).in("status", from).select(COLUMNS).maybeSingle<Row>();
    if (error) fail("update the job", error);
    return data ? toJob(data) : null;
  },

  async pay(tenantId, id, actor) {
    const { error } = await createAdminClient().rpc("vendor_job_pay", { p_tenant: tenantId, p_job: id, p_actor_id: actor.id, p_actor_name: actor.name });
    if (error) fail("pay the job", error);
  },
};
