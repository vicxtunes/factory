// A studio hiring a vendor on a project: the job, its life and its money. Pure.
//
//   requested ─▶ accepted ─▶ delivered ─▶ paid
//       │            │
//       ├▶ declined  └▶ cancelled (the studio)
//       └▶ cancelled (the studio)
//
// The vendor accepts or declines a request and marks the work delivered; the
// studio cancels an open job, and approves and pays a delivered one (from
// its Business card; the vendor's gets the price less Aming's fee).

import { VENDOR_FEE_PERCENT } from "./categories";

export type JobStatus = "requested" | "accepted" | "declined" | "cancelled" | "delivered" | "paid";

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  requested: "Waiting for the vendor",
  accepted: "In progress",
  declined: "Declined",
  cancelled: "Cancelled",
  delivered: "Delivered",
  paid: "Paid",
};

export interface VendorJob {
  id: string;
  /** The studio, and its project. */
  tenantId: string;
  projectId: string;
  vendorId: string;
  brief: string;
  /** "yyyy-mm-dd", or none. */
  dueOn: string | null;
  /** Whole UGX the studio pays. */
  price: number;
  status: JobStatus;
  /** Aming's fee, once paid. */
  fee: number | null;
  requestedByName: string;
  createdAt: string;
}

/** A job with who it's between and what it's for. */
export interface JobView extends VendorJob {
  vendor: { name: string; category: string; clientId: string; photoKey: string | null };
  studio: { name: string; ownerClientId: string | null };
  projectTitle: string;
}

/** What a studio sends (jobRequestSchema's output). */
export interface JobRequest {
  projectId: string;
  vendorId: string;
  brief: string;
  dueOn: string | null;
  price: number;
}

/** Aming's fee on a job's price, rounded to the nearest shilling (as vendor_job_pay() takes it). */
export const jobFee = (price: number) => Math.floor((price * VENDOR_FEE_PERCENT + 50) / 100);

/** What the vendor receives for a job. */
export const vendorTake = (price: number) => price - jobFee(price);

/** Still going: the vendor has the request, or the work. */
export const isOpenJob = (status: JobStatus) => status === "requested" || status === "accepted" || status === "delivered";

/** Whether the vendor reaches the project's folder: from accepting until it's paid. */
export const reachesFolder = (status: JobStatus) => status === "accepted" || status === "delivered" || status === "paid";
