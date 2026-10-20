// What a host app must provide for vendors. This app's implementation is in
// ./adapters/supabase.

import { AppError } from "@repo/lib/kernel/core";

import type { VendorPicture } from "./core/categories";
import type { JobRequest, JobStatus, JobView, VendorJob } from "./core/jobs";
import type { Vendor, VendorJoin, VendorProfile } from "./core/model";
import type { OfferInput, VendorOffer } from "./core/services";

export interface VendorStore {
  /** The vendor behind an Aming account, if it has joined. */
  byClient(clientId: string): Promise<Vendor | null>;
  get(id: string): Promise<Vendor | null>;
  /** A new vendor for the account; the one it has, when it joined meanwhile. */
  create(clientId: string, name: string, join: Omit<VendorJoin, "businessName">): Promise<Vendor>;
  updateProfile(id: string, profile: VendorProfile): Promise<Vendor>;
  /** Active vendors whose name has every word, and maybe of one category; the newest first. */
  search(words: string[], category: string | null): Promise<Vendor[]>;
  /** What's in the vendor's wallet; 0 before their first job is paid. */
  walletBalance(id: string): Promise<number>;
  /** Sets one of the vendor's pictures; returns the key it replaced. */
  setPicture(id: string, which: VendorPicture, key: string): Promise<string | null>;
  createOffer(vendorId: string, offer: OfferInput): Promise<VendorOffer>;
  /** False when the vendor has no such service. */
  updateOffer(vendorId: string, id: string, offer: OfferInput): Promise<boolean>;
  /** Deletes the service with its samples; their keys, or null when the vendor has no such service. */
  deleteOffer(vendorId: string, id: string): Promise<string[] | null>;
  addSample(vendorId: string, offerId: string, key: string): Promise<void>;
  /** The deleted sample's key; null when the vendor has no such sample. */
  removeSample(vendorId: string, id: string): Promise<string | null>;
}

/** The picture files (R2): a signed upload link, then checked and moved into place. */
export interface VendorFiles {
  putUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  getUrl(key: string, expiresInSeconds: number): Promise<string>;
  size(key: string): Promise<number | null>;
  move(fromKey: string, toKey: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** A problem the person should see (the message is safe to show). */
export class VendorError extends AppError {}

export interface VendorJobStore {
  /** A new request, in its folder. Throws VendorError when the vendor has an open job on that project already. */
  create(tenantId: string, request: JobRequest, folderId: string, requestedByName: string): Promise<VendorJob>;
  get(id: string): Promise<JobView | null>;
  forVendor(vendorId: string): Promise<JobView[]>;
  forProject(tenantId: string, projectId: string): Promise<JobView[]>;
  /** Disputes, and delivered work waiting on the studio, oldest first: staff's queue and the overdue check. */
  needingAttention(): Promise<JobView[]>;
  /**
   * Moves the job on only if it's still in one of `from` (no money moves);
   * null when it wasn't (someone moved it first). A dispute says who and why.
   */
  move(id: string, from: JobStatus[], to: JobStatus, dispute?: { by: "studio" | "vendor"; reason: string }): Promise<VendorJob | null>;
  /** The studio pays the price in to Aming and the work goes ahead (vendor_job_fund()). */
  fund(tenantId: string, id: string, actor: { id: string; name: string }): Promise<void>;
  /** The held money to the vendor's wallet, less Aming's fee (vendor_job_release()). */
  release(id: string, actor: JobActor): Promise<void>;
  /** The held money back on the studio's Business card (vendor_job_refund()). */
  refund(id: string, actor: JobActor): Promise<void>;
  /** The folder the vendor works in, for an open job of the studio's; false when it isn't open (or not the studio's). */
  setFolder(tenantId: string, id: string, folderId: string): Promise<boolean>;
  /** Delivered work left unanswered: the warning went out. */
  markWarned(id: string): Promise<void>;
}

/** Who moved the money: a studio's or vendor's account, a member of staff, or the system (the 2-day release). */
export type JobActor = { type: "client" | "dashboard_user" | "system"; id: string | null; name: string };

/** Tells someone in the app (a push notification). Best effort. */
export interface JobNotifier {
  notify(clientId: string, message: { title: string; body: string; url: string }): Promise<void>;
  /** Aming's boss: delivered work left unanswered, and disputes to settle. */
  tellBoss(message: { title: string; body: string; url: string }): Promise<void>;
}
