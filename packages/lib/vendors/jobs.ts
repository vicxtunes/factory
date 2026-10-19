// Studios hiring vendors on projects (core/jobs.ts): the studio sends a
// request, the vendor accepts or declines it and delivers the work, the
// studio cancels or approves and pays. Each side is told in the app.

import { vendorTake, type JobRequest, type JobStatus, type JobView } from "./core";
import { VendorError, type JobNotifier, type VendorJobStore, type VendorStore } from "./ports";

const money = (n: number) => `UGX ${n.toLocaleString("en-US")}`;

export class VendorJobService {
  constructor(
    private readonly jobs: VendorJobStore,
    private readonly vendors: VendorStore,
    private readonly notifier: JobNotifier,
  ) {}

  // ── The studio ──

  /** Asks a vendor to do work on one of the studio's projects. */
  async request(studio: { tenantId: string; name: string; actorName: string }, request: JobRequest): Promise<void> {
    const vendor = await this.vendors.get(request.vendorId);
    if (!vendor || vendor.status !== "active") throw new VendorError("That vendor isn't taking work on Aming.");
    const job = await this.jobs.create(studio.tenantId, request, studio.actorName);
    await this.notifier.notify(vendor.clientId, {
      title: `Job request from ${studio.name}`,
      body: `${request.brief.slice(0, 80)} · ${money(vendorTake(request.price))} for you`,
      url: `/vendors/jobs/${job.id}`,
    });
  }

  async forProject(tenantId: string, projectId: string): Promise<JobView[]> {
    return this.jobs.forProject(tenantId, projectId);
  }

  /** The studio calls off a job the vendor hasn't delivered. */
  async cancel(tenantId: string, id: string): Promise<void> {
    const job = await this.studioJob(tenantId, id);
    await this.moveOrSay(id, ["requested", "accepted"], "cancelled", "This job can't be cancelled now.");
    await this.notifier.notify(job.vendor.clientId, { title: `${job.studio.name} cancelled a job`, body: job.brief.slice(0, 80), url: `/vendors/jobs/${id}` });
  }

  /** The studio approves the delivered work and pays it from its Business card. */
  async pay(tenantId: string, id: string, actor: { id: string; name: string }): Promise<void> {
    const job = await this.studioJob(tenantId, id);
    await this.jobs.pay(tenantId, id, actor);
    await this.notifier.notify(job.vendor.clientId, {
      title: `${job.studio.name} paid you`,
      body: `${money(vendorTake(job.price))} is in your wallet.`,
      url: `/vendors/jobs/${id}`,
    });
  }

  // ── The vendor ──

  /** The vendor's jobs, the newest first. */
  async forVendor(clientId: string): Promise<JobView[]> {
    const vendor = await this.vendors.byClient(clientId);
    return vendor ? this.jobs.forVendor(vendor.id) : [];
  }

  /** One of the vendor's jobs; null when it isn't theirs. */
  async vendorJob(clientId: string, id: string): Promise<JobView | null> {
    const [vendor, job] = await Promise.all([this.vendors.byClient(clientId), this.jobs.get(id)]);
    return vendor && job?.vendorId === vendor.id ? job : null;
  }

  /** The vendor takes the job on, or turns it down. */
  async respond(clientId: string, id: string, accept: boolean): Promise<void> {
    const job = await this.ownJob(clientId, id);
    const to: JobStatus = accept ? "accepted" : "declined";
    await this.moveOrSay(id, ["requested"], to, "This request has been answered or called off.");
    await this.tellStudio(job, `${job.vendor.name} ${accept ? "accepted" : "declined"} a job`);
  }

  /** The vendor says the work is done (in the project's folder). */
  async deliver(clientId: string, id: string): Promise<void> {
    const job = await this.ownJob(clientId, id);
    await this.moveOrSay(id, ["accepted"], "delivered", "Only a job in progress can be delivered.");
    await this.tellStudio(job, `${job.vendor.name} delivered: approve and pay`);
  }

  private async ownJob(clientId: string, id: string): Promise<JobView> {
    const job = await this.vendorJob(clientId, id);
    if (!job) throw new VendorError("That job doesn't exist.");
    return job;
  }

  private async studioJob(tenantId: string, id: string): Promise<JobView> {
    const job = await this.jobs.get(id);
    if (!job || job.tenantId !== tenantId) throw new VendorError("That job doesn't exist.");
    return job;
  }

  private async moveOrSay(id: string, from: JobStatus[], to: JobStatus, otherwise: string): Promise<void> {
    if (!(await this.jobs.move(id, from, to))) throw new VendorError(otherwise);
  }

  private async tellStudio(job: JobView, title: string): Promise<void> {
    if (job.studio.ownerClientId) await this.notifier.notify(job.studio.ownerClientId, { title, body: job.brief.slice(0, 80), url: `/studio/projects/${job.projectId}` });
  }
}
