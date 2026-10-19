// What a host app must provide for vendors. This app's implementation is in
// ./adapters/supabase.

import { AppError } from "@repo/lib/kernel/core";

import type { VendorPicture } from "./core/categories";
import type { JobRequest, JobStatus, JobView, VendorJob } from "./core/jobs";
import type { Vendor, VendorJoin, VendorProfile } from "./core/model";

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
  /** A new request. Throws VendorError when the vendor has an open job on that project already. */
  create(tenantId: string, request: JobRequest, requestedByName: string): Promise<VendorJob>;
  get(id: string): Promise<JobView | null>;
  forVendor(vendorId: string): Promise<JobView[]>;
  forProject(tenantId: string, projectId: string): Promise<JobView[]>;
  /** Moves the job on only if it's still in one of `from`; null when it wasn't (someone moved it first). */
  move(id: string, from: JobStatus[], to: JobStatus): Promise<VendorJob | null>;
  /** Pays a delivered job from the studio's Business card (vendor_job_pay()). */
  pay(tenantId: string, id: string, actor: { id: string; name: string }): Promise<void>;
}

/** Tells someone in the app (a push notification). Best effort. */
export interface JobNotifier {
  notify(clientId: string, message: { title: string; body: string; url: string }): Promise<void>;
}
