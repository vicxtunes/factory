// Studios hiring vendors on projects (core/jobs.ts). The studio sends a
// request in a chosen folder, maybe asking for samples first; the vendor
// accepts or declines, and sends samples when asked. When the work goes
// ahead the studio pays the price in to Aming, which holds it; the vendor
// delivers, and the studio approves (the money is released to the vendor)
// or disputes (Aming's staff release or refund). Delivered work left
// unanswered is released on its own after two days, the boss and the studio
// warned a day before. Each side is told in the app.

import { autoReleaseAt, isOpenJob, jobLabel, overdueStep, rentalPrice, vendorTake, type JobAnswer, type JobRequest, type JobStatus, type JobView, type RentalRequest } from "./core";
import { VendorError, type JobActor, type JobNotifier, type VendorJobStore, type VendorStore } from "./ports";

const money = (n: number) => `UGX ${n.toLocaleString("en-US")}`;

/** What's held for a job, and until when, as the vendor hears it paid in. */
const heldLine = (job: JobView) =>
  job.rental
    ? `${money(job.price)} is held by Aming. Hand it over ${dayName(job.rental.startsOn)}; it's released to you once it's back and approved.`
    : `${money(job.price)} is held by Aming until you deliver and it's approved.`;

/** "Fri 7 Nov". */
const dayName = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const STAFF_QUEUE = "/dashboard/vendor-jobs";

export class VendorJobService {
  constructor(
    private readonly jobs: VendorJobStore,
    private readonly vendors: VendorStore,
    private readonly notifier: JobNotifier,
  ) {}

  // ── The studio ──

  /** Asks a vendor to do work for the studio (on one of its projects or not), in a folder of the studio's. */
  async request(studio: { tenantId: string; name: string; actorName: string }, request: JobRequest, folderId: string | null): Promise<void> {
    const vendor = await this.vendors.get(request.vendorId);
    if (!vendor || vendor.status !== "active") throw new VendorError("That vendor isn't taking work on Aming.");
    const job = await this.jobs.create(studio.tenantId, request, folderId, studio.actorName);
    await this.notifier.notify(vendor.clientId, {
      title: request.rental ? `Hire request from ${studio.name}` : `Job request from ${studio.name}`,
      body: request.rental
        ? `${request.rental.quantity} × ${request.rental.item}, ${dayName(request.rental.startsOn)} to ${dayName(request.rental.endsOn)} · ${money(vendorTake(request.price))} for you`
        : `${request.brief.slice(0, 80)} · ${money(vendorTake(request.price))} for you${request.samplesWanted ? " · samples first" : ""}`,
      url: `/vendors/jobs/${job.id}`,
    });
  }

  /**
   * Hires equipment from a vendor: one of their items priced per day, week or
   * month, how many, and from which day to which. The price is the vendor's
   * rate for that time; the return day is the deadline. No folder: nothing
   * is delivered in one.
   */
  async requestRental(studio: { tenantId: string; name: string; actorName: string }, input: RentalRequest): Promise<void> {
    const vendor = await this.vendors.get(input.vendorId);
    if (!vendor || vendor.status !== "active") throw new VendorError("That vendor isn't taking work on Aming.");
    const offer = vendor.offers.find((o) => o.id === input.offerId);
    if (!offer || offer.price === null || offer.unit === null) throw new VendorError("Choose one of the vendor's priced items.");
    const rental = { item: offer.name, quantity: input.quantity, startsOn: input.startsOn, endsOn: input.endsOn };
    const price = rentalPrice({ price: offer.price, unit: offer.unit }, input.quantity, input.startsOn, input.endsOn);
    if (price > 100_000_000) throw new VendorError("That's more than one hire can be: hire fewer, or for less time.");
    await this.request(
      studio,
      { projectId: input.projectId, vendorId: vendor.id, brief: input.note ?? `${rental.quantity} × ${rental.item}`, samplesWanted: null, dueOn: input.endsOn, price, rental },
      null,
    );
  }

  async forProject(tenantId: string, projectId: string): Promise<JobView[]> {
    return this.jobs.forProject(tenantId, projectId);
  }

  /** Every vendor job of the studio's, on a project or not, the newest first. */
  async forStudio(tenantId: string): Promise<JobView[]> {
    return this.jobs.forStudio(tenantId);
  }

  /** A job was paid in by mobile money (wallet/server/mobile-money.ts): the vendor hears it can go ahead. */
  async paidIn(id: string): Promise<void> {
    const job = await this.jobs.get(id);
    if (job?.status === "in_progress") await this.tellVendor(job, `${job.studio.name} paid in: ${job.rental ? "get it ready" : "start the work"}`, heldLine(job));
  }

  /** The studio calls off a job before any money is held (after that, it disputes). */
  async cancel(tenantId: string, id: string): Promise<void> {
    const job = await this.studioJob(tenantId, id);
    await this.moveOrSay(id, ["requested", "samples", "samples_sent", "awaiting_funds"], "cancelled", "This job can't be cancelled now: raise a dispute instead.");
    await this.tellVendor(job, `${job.studio.name} cancelled a job`, job.brief.slice(0, 80));
  }

  /** The studio approves the samples (if there were any) and pays the price in to Aming: the work goes ahead. */
  async fund(tenantId: string, id: string, actor: { id: string; name: string }): Promise<void> {
    const job = await this.studioJob(tenantId, id);
    await this.jobs.fund(tenantId, id, actor);
    await this.tellVendor(
      job,
      job.status === "samples_sent" ? `${job.studio.name} approved your samples` : `${job.studio.name} paid in: ${job.rental ? "get it ready" : "start the work"}`,
      heldLine(job),
    );
  }

  /** The studio approves the delivered work: the held money goes to the vendor. */
  async approve(tenantId: string, id: string, actor: { id: string; name: string }): Promise<void> {
    const job = await this.studioJob(tenantId, id);
    if (job.status !== "delivered") throw new VendorError("Only delivered work can be approved.");
    await this.jobs.release(id, { type: "client", ...actor });
    await this.tellVendor(job, `${job.studio.name} approved your work`, `${money(vendorTake(job.price))} is in your wallet.`);
  }

  /**
   * Gives an open job the folder the vendor works in, when it has none (made
   * before jobs had folders, or its folder was deleted) or the studio moves
   * it. `folderIn` finds or makes the folder inside the job's project.
   */
  async setFolder(tenantId: string, id: string, folderIn: (projectId: string | null) => Promise<string>): Promise<void> {
    const job = await this.studioJob(tenantId, id);
    if (!isOpenJob(job.status)) throw new VendorError("This job is over: it has no folder to give.");
    if (!(await this.jobs.setFolder(tenantId, id, await folderIn(job.projectId)))) throw new VendorError("This job has moved on: reload to see where it is.");
    await this.tellVendor(job, `${job.studio.name} set your folder`, `For ${jobLabel(job)}: your files go there.`);
  }

  /** The studio raises a dispute over work in progress or delivered: Aming's staff settle it. */
  async studioDispute(tenantId: string, id: string, reason: string): Promise<void> {
    const job = await this.studioJob(tenantId, id);
    await this.dispute(job, "studio", reason);
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

  /**
   * The vendor takes the job on (to samples, or to the studio paying in),
   * committing to deliver by its due day (or a day they set when it has
   * none), or turns it down.
   */
  async respond(clientId: string, id: string, answer: JobAnswer, today: string): Promise<void> {
    const job = await this.ownJob(clientId, id);
    if (!answer.accept) {
      await this.moveOrSay(id, ["requested"], "declined", "This request has been answered or called off.");
      await this.tellStudio(job, `${job.vendor.name} declined a job`, job.brief.slice(0, 80));
      return;
    }
    if (job.dueOn && answer.deliverBy !== job.dueOn) throw new VendorError(`This job is due ${dayName(job.dueOn)}: accept to deliver by then, or decline.`);
    if (!job.dueOn) {
      if (answer.deliverBy < today) throw new VendorError("Choose a day from today on.");
      if (job.status === "requested") await this.jobs.setDueOn(id, answer.deliverBy);
    }
    await this.moveOrSay(id, ["requested"], job.samplesWanted ? "samples" : "awaiting_funds", "This request has been answered or called off.");
    await this.tellStudio(
      job,
      `${job.vendor.name} accepted: delivery by ${dayName(answer.deliverBy)}`,
      job.samplesWanted ? "They're making the samples you asked for." : "Pay it in to Aming to start the work.",
    );
  }

  /** The vendor's samples are in the job's folder: the studio reviews them. */
  async sendSamples(clientId: string, id: string): Promise<void> {
    const job = await this.ownJob(clientId, id);
    await this.moveOrSay(id, ["samples"], "samples_sent", "Samples aren't asked for now.");
    await this.tellStudio(job, `${job.vendor.name} sent samples`, "Review them: approve and pay in to go ahead, or cancel.");
  }

  /** A rental paid in: the vendor handed the equipment over to the studio. */
  async handOver(clientId: string, id: string): Promise<void> {
    const job = await this.ownJob(clientId, id);
    if (!job.rental) throw new VendorError("Only hired equipment is handed over.");
    if (!(await this.jobs.handOver(id))) throw new VendorError("It's handed over once it's paid in, and only once.");
    await this.tellStudio(job, `${job.vendor.name} handed over ${job.rental.quantity} × ${job.rental.item}`, `Return it by ${dayName(job.rental.endsOn)}.`);
  }

  /** The vendor says the work is done, in the job's folder; or, for a rental, that the equipment came back. */
  async deliver(clientId: string, id: string): Promise<void> {
    const job = await this.ownJob(clientId, id);
    if (job.rental && !job.handedOverAt) throw new VendorError("Hand it over first.");
    await this.moveOrSay(id, ["in_progress"], "delivered", job.rental ? "Only equipment that's out can come back." : "Only work in progress can be delivered.");
    await this.tellStudio(
      job,
      job.rental ? `${job.vendor.name}: ${job.rental.item} returned` : `${job.vendor.name} delivered`,
      job.rental
        ? "Approve to release their pay, or raise a dispute within 2 days if something's wrong; after that it's released to them."
        : "Approve it, or raise a dispute within 2 days; after that it's released to them.",
    );
  }

  /** The vendor can't do the work (or hire the equipment) after all: the held money goes back to the studio. */
  async withdraw(clientId: string, id: string): Promise<void> {
    const job = await this.ownJob(clientId, id);
    if (job.status !== "in_progress") throw new VendorError("Only work in progress can be given up.");
    if (job.handedOverAt) throw new VendorError("It's handed over already: mark it returned, or raise a dispute.");
    await this.jobs.refund(id, { type: "client", id: clientId, name: job.vendor.name });
    await this.tellStudio(job, `${job.vendor.name} withdrew from a job`, `${money(job.price)} is back on your Business card.`);
  }

  // ── Aming's staff, and the clock ──

  /** Disputes, and delivered work waiting on the studio. */
  async needingAttention(): Promise<JobView[]> {
    return this.jobs.needingAttention();
  }

  /** Staff settle a dispute: the money to the vendor, or back to the studio. */
  async settle(id: string, outcome: "release" | "refund", staff: { id: string; name: string }): Promise<void> {
    const job = await this.jobs.get(id);
    if (!job || job.status !== "disputed") throw new VendorError("That dispute is settled already.");
    const actor: JobActor = { type: "dashboard_user", ...staff };
    if (outcome === "release") await this.jobs.release(id, actor);
    else await this.jobs.refund(id, actor);
    const result = outcome === "release" ? `Released to ${job.vendor.name}` : `Refunded to ${job.studio.name}`;
    await Promise.all([this.tellVendor(job, "A dispute was settled", `${result}: ${money(job.price)}.`), this.tellStudio(job, "A dispute was settled", `${result}: ${money(job.price)}.`)]);
  }

  /**
   * Delivered work the studio hasn't answered: the boss and the studio are
   * warned after a day, and it's released to the vendor after two. Run
   * whenever a page that shows jobs opens (no schedule is needed).
   */
  async sweepOverdue(now = Date.now()): Promise<void> {
    for (const job of await this.jobs.needingAttention()) {
      const step = overdueStep(job, now);
      if (step === "warn") {
        await this.jobs.markWarned(job.id);
        const when = new Date(autoReleaseAt(job)!).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala" });
        const body = `${job.studio.name} hasn't answered ${job.vendor.name}'s delivered work (${money(job.price)}). It's released to the vendor ${when}.`;
        await Promise.all([this.notifier.tellBoss({ title: "Vendor work waiting on a studio", body, url: STAFF_QUEUE }), this.tellStudio(job, "Work waiting for your approval", body)]);
      } else if (step === "release") {
        await this.jobs.release(job.id, { type: "system", id: null, name: "Aming (no answer in 2 days)" });
        await Promise.all([
          this.tellVendor(job, "You were paid", `${money(vendorTake(job.price))} for ${jobLabel(job)} is in your wallet (released after 2 days).`),
          this.tellStudio(job, "Vendor work released", `${job.vendor.name} was paid for ${jobLabel(job)}: no answer in 2 days.`),
        ]);
      }
    }
  }

  private async dispute(job: JobView, by: "studio" | "vendor", reason: string): Promise<void> {
    await this.moveOrSay(job.id, ["in_progress", "delivered"], "disputed", "Only work in progress or delivered can be disputed.", { by, reason });
    const body = `${job.studio.name} and ${job.vendor.name}, ${jobLabel(job)} (${money(job.price)} held): "${reason.slice(0, 120)}"`;
    await Promise.all([
      this.notifier.tellBoss({ title: "A vendor job is disputed", body, url: STAFF_QUEUE }),
      by === "studio" ? this.tellVendor(job, `${job.studio.name} raised a dispute`, `Aming will look into it: "${reason.slice(0, 120)}"`) : this.tellStudio(job, `${job.vendor.name} raised a dispute`, reason.slice(0, 120)),
    ]);
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

  private async moveOrSay(id: string, from: JobStatus[], to: JobStatus, otherwise: string, dispute?: { by: "studio" | "vendor"; reason: string }): Promise<void> {
    if (!(await this.jobs.move(id, from, to, dispute))) throw new VendorError(otherwise);
  }

  private async tellVendor(job: JobView, title: string, body: string): Promise<void> {
    await this.notifier.notify(job.vendor.clientId, { title, body, url: `/vendors/jobs/${job.id}` });
  }

  private async tellStudio(job: JobView, title: string, body: string): Promise<void> {
    if (job.studio.ownerClientId) await this.notifier.notify(job.studio.ownerClientId, { title, body, url: job.projectId ? `/studio/projects/${job.projectId}?tab=vendors` : "/studio/jobs" });
  }
}
