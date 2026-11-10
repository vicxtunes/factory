import "server-only";

import { z } from "zod";

import { approveVendorJob, cancelVendorJob, deliverJob, disputeVendorJob, fundVendorJob, handOverJob, respondToJob, sendSamples, withdrawFromJob } from "@repo/lib/vendors/actions";
import { jobLabel, type JobView } from "@repo/lib/vendors/core/jobs";
import { vendorJobs } from "@repo/lib/vendors/server";

import { changeTool, outcome, type ChangeTool } from "../toolbox";

// Jobs and rentals between studios and vendors through Alexis (2026-11-10):
// each card runs the job page's own server action, which checks again that the
// job is the person's and that it's at the right step.

const money = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;
const jobId = z.object({ jobId: z.string().uuid() });

async function find(list: Promise<JobView[]>, id: string): Promise<JobView> {
  const job = (await list).find((j) => j.id === id);
  if (!job) throw new Error("That job doesn't exist. Look it up again.");
  return job;
}

/** The vendor's side: answer a request, samples, hand over, deliver, give up. `clientId`: the signed-in vendor's account. */
export function vendorJobChanges(clientId: string): ChangeTool[] {
  const job = (id: string) => find(vendorJobs.forVendor(clientId), id);
  const simple = (name: string, description: string, verb: string, act: (id: string) => Promise<{ ok: boolean; error?: string }>, done: string) =>
    changeTool({
      name,
      description: `${description} Job id from vendor_jobs.`,
      inputSchema: jobId,
      card: async ({ jobId: id }) => {
        const j = await job(id);
        return { title: `${verb}: ${jobLabel(j)}`, lines: [`For ${j.studio.name}`, money(j.price)] };
      },
      run: async ({ jobId: id }) => outcome(await act(id), done),
    });
  return [
    changeTool({
      name: "answer_job",
      description: "Accept a studio's job request, promising to deliver by a day, or decline it. Job id from vendor_jobs.",
      inputSchema: z.object({ jobId: z.string().uuid(), accept: z.boolean(), deliverBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }),
      card: async ({ jobId: id, accept, deliverBy }) => {
        const j = await job(id);
        if (accept && !deliverBy) throw new Error("Ask which day they'll deliver by.");
        return { title: `${accept ? "Accept" : "Decline"}: ${jobLabel(j)}`, lines: [`For ${j.studio.name}`, money(j.price), ...(accept ? [`Deliver by ${deliverBy}`] : [])] };
      },
      run: async ({ jobId: id, accept, deliverBy }) => outcome(await respondToJob(id, accept ? { accept: true, deliverBy } : { accept: false }), accept ? "The job is accepted." : "The job is declined."),
    }),
    simple("send_samples", "The samples the studio asked for are in the job's folder.", "Samples are ready", sendSamples, "The studio is told the samples are ready."),
    simple("hand_over_rental", "Hired equipment was handed over to the studio.", "Handed over", handOverJob, "It's marked handed over."),
    simple("deliver_job", "The work is done and in the job's folder (or hired equipment came back).", "Delivered", deliverJob, "It's delivered: the studio is asked to approve it."),
    simple("withdraw_from_job", "Give up work in progress: the held money goes back to the studio.", "Give up", withdrawFromJob, "You've withdrawn: the money goes back to the studio."),
  ];
}

/** The studio's side. `projects`/`money`: whether the person may use those parts of the studio. */
export function studioJobChanges(tenantId: string, can: { projects: boolean; money: boolean }): ChangeTool[] {
  const job = (id: string) => find(vendorJobs.forStudio(tenantId), id);
  const card = (verb: string, extra: (j: JobView) => string[]) => async ({ jobId: id }: { jobId: string }) => {
    const j = await job(id);
    return { title: `${verb}: ${jobLabel(j)}`, lines: [`Vendor: ${j.vendor.name}`, money(j.price), ...extra(j)] };
  };
  const tools: ChangeTool[] = [];
  if (can.projects) {
    tools.push(
      changeTool({ name: "cancel_vendor_job", description: "Call off a job with a vendor before any money is held. Job id from studio_vendor_jobs.", inputSchema: jobId, card: card("Call off", () => []), run: async ({ jobId: id }) => outcome(await cancelVendorJob(id), "The job is called off.") }),
      changeTool({
        name: "dispute_vendor_job",
        description: "Raise a problem with a vendor's work in progress or delivered, in words: Aming's staff settle it.",
        inputSchema: z.object({ jobId: z.string().uuid(), reason: z.string().trim().min(5).max(1000) }),
        card: async ({ jobId: id, reason }) => ({ ...(await card("Raise a problem", () => [`What's wrong: ${reason}`, "Aming's staff settle it"])({ jobId: id })) }),
        run: async ({ jobId: id, reason }) => outcome(await disputeVendorJob(id, reason), "Aming's staff will settle it."),
      }),
    );
  }
  if (can.money) {
    tools.push(
      changeTool({ name: "pay_vendor_job", description: "Pay a job in to Aming from the studio's wallet (approving the samples, if any): Aming holds it and the vendor goes ahead.", inputSchema: jobId, card: card("Pay in", () => ["From the studio's wallet, held by Aming until you approve the work"]), run: async ({ jobId: id }) => outcome(await fundVendorJob(id), "It's paid in: the vendor goes ahead.") }),
      changeTool({ name: "approve_vendor_job", description: "Approve a vendor's delivered work: Aming releases the held money to the vendor.", inputSchema: jobId, card: card("Approve the work", () => ["Aming pays the held money to the vendor"]), run: async ({ jobId: id }) => outcome(await approveVendorJob(id), "Approved: the vendor is paid.") }),
    );
  }
  return tools;
}
