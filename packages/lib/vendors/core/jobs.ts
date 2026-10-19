// A studio hiring a vendor on a project: the job, its life and its money. Pure.
//
//   requested ─▶ samples ─▶ samples_sent ─▶ (studio approves, pays in) in_progress
//      │   └─────▶ awaiting_funds ─────────▶ (studio pays in) ─┘
//      └▶ declined                    in_progress ─▶ delivered ─▶ paid
//                                         │             └─▶ disputed ─▶ paid | refunded
//                                         └▶ refunded (the vendor withdrew)
//   cancelled: by the studio, before any money is held.
//
// The studio's money is held by Aming from the moment the work goes ahead
// (in_progress) until it's released to the vendor (less Aming's fee) or
// refunded. Delivered work the studio doesn't answer is released on its own
// after AUTO_RELEASE_HOURS; the boss and the studio are warned at WARN_HOURS.
// A dispute goes to Aming's staff, who release or refund.

import { VENDOR_FEE_PERCENT } from "./categories";

export type JobStatus =
  | "requested"
  | "declined"
  | "samples"
  | "samples_sent"
  | "awaiting_funds"
  | "cancelled"
  | "in_progress"
  | "delivered"
  | "disputed"
  | "paid"
  | "refunded";

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  requested: "Waiting for the vendor",
  declined: "Declined",
  samples: "Making samples",
  samples_sent: "Samples to review",
  awaiting_funds: "Waiting for payment into Aming",
  cancelled: "Cancelled",
  in_progress: "In progress",
  delivered: "Delivered",
  disputed: "In dispute",
  paid: "Paid",
  refunded: "Refunded",
};

export interface VendorJob {
  id: string;
  /** The studio, and its project. */
  tenantId: string;
  projectId: string;
  vendorId: string;
  /** The folder the vendor works in (inside the project's); null: it was deleted. */
  folderId: string | null;
  brief: string;
  /** What the studio wants to see first; null: no samples. */
  samplesWanted: string | null;
  /** "yyyy-mm-dd", or none. */
  dueOn: string | null;
  /** Whole UGX the studio pays in. */
  price: number;
  status: JobStatus;
  /** Aming's fee, once released. */
  fee: number | null;
  requestedByName: string;
  createdAt: string;
  deliveredAt: string | null;
  /** When the money went in to Aming. */
  fundedAt: string | null;
  disputedBy: "studio" | "vendor" | null;
  disputeReason: string | null;
  /** Delivered work left unanswered: when the boss and the studio were warned. */
  overdueAlertedAt: string | null;
}

/** A job with who it's between and what it's for. */
export interface JobView extends VendorJob {
  vendor: { name: string; category: string; clientId: string; photoKey: string | null };
  studio: { name: string; ownerClientId: string | null };
  projectTitle: string;
}

/** What a studio sends (jobRequestSchema's output), its folder already chosen or made. */
export interface JobRequest {
  projectId: string;
  vendorId: string;
  brief: string;
  samplesWanted: string | null;
  dueOn: string | null;
  price: number;
}

/** Where the vendor will work: a folder in the project's, or a new one there. */
export type JobFolder = { kind: "existing"; folderId: string } | { kind: "new"; name: string };

/** Aming's fee on a job's price, rounded to the nearest shilling (as vendor_job_release() takes it). */
export const jobFee = (price: number) => Math.floor((price * VENDOR_FEE_PERCENT + 50) / 100);

/** What the vendor receives for a job. */
export const vendorTake = (price: number) => price - jobFee(price);

/** Still going: a request, samples, waiting for money, or the work. */
export const isOpenJob = (status: JobStatus) =>
  ["requested", "samples", "samples_sent", "awaiting_funds", "in_progress", "delivered", "disputed"].includes(status);

/** Whether the vendor reaches the job's folder: from accepting (samples go there too) until it's paid; not once it's over otherwise. */
export const reachesFolder = (status: JobStatus) => ["samples", "samples_sent", "awaiting_funds", "in_progress", "delivered", "disputed", "paid"].includes(status);

/** Aming holds the studio's money for it now. */
export const isHeld = (status: JobStatus) => status === "in_progress" || status === "delivered" || status === "disputed";

/** Hours after delivery, with no answer from the studio: warn the boss and the studio, then release. */
export const WARN_HOURS = 24;
export const AUTO_RELEASE_HOURS = 48;

/** When delivered work is released on its own (ISO), or null when it isn't waiting on the studio. */
export function autoReleaseAt(job: Pick<VendorJob, "status" | "deliveredAt">): string | null {
  if (job.status !== "delivered" || !job.deliveredAt) return null;
  return new Date(new Date(job.deliveredAt).getTime() + AUTO_RELEASE_HOURS * 3_600_000).toISOString();
}

/** What's due for delivered work left unanswered, `now` (ms): warn first, then release. */
export function overdueStep(job: Pick<VendorJob, "status" | "deliveredAt" | "overdueAlertedAt">, now: number): "warn" | "release" | null {
  if (job.status !== "delivered" || !job.deliveredAt) return null;
  const hours = (now - new Date(job.deliveredAt).getTime()) / 3_600_000;
  if (hours >= AUTO_RELEASE_HOURS) return "release";
  if (hours >= WARN_HOURS && !job.overdueAlertedAt) return "warn";
  return null;
}
