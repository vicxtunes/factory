"use client";

// Every upload in the app, and zip downloads: they live here, not in the page
// that started them, so the person can move around Aming while they go. They
// show in the transfers panel (TransferTray, in each app's root layout) and,
// on the page they belong to, wherever that page shows them (useUploads).
//
// Each upload is kept on the device until it's in (./saved.ts), tried 3 times
// and, when the connection drops, again when it's back; a big one goes in
// pieces and carries on where it stopped. What each kind does is in
// ./senders.ts.
import { create } from "zustand";

import { reportUploadTrouble } from "@repo/lib/storage/actions";
import type { Via } from "@repo/lib/files/core";

import { forgetAllUploads, forgetUpload, keepUpload, savedUploads, type SavedUpload } from "./saved";
import { Refused, RESUMES_BY_ITSELF, send, type Progress, type UploadTarget } from "./senders";

export type { UploadTarget } from "./senders";

export type UploadJob = SavedUpload & {
  /** paused: back from an earlier visit, waiting for the person to resume it. */
  state: "waiting" | "uploading" | "done" | "failed" | "paused";
  progress: number;
  /** While retrying: what's happening; when failed: why. */
  note?: string;
  /** Failed on the connection (tried again when it's back), not refused by Aming. */
  retryable?: boolean;
};

export type ZipJob = { id: string; name: string; state: "working" | "done" | "failed"; note: string };

type Transfers = {
  uploads: UploadJob[];
  zips: ZipJob[];
  /** Goes up each time a file is in, so the open page can refresh. */
  finished: number;
};

export const useTransfers = create<Transfers>(() => ({ uploads: [], zips: [], finished: 0 }));

const CONCURRENT = 3;
const TRIES = 3;

function patch(id: string, change: Partial<UploadJob>) {
  useTransfers.setState((s) => ({ uploads: s.uploads.map((u) => (u.id === id ? { ...u, ...change } : u)) }));
}

/** The part of a job kept on the device. */
function saved(job: UploadJob): SavedUpload {
  const { id, name, where, target, file, pass, resume, landed, reported } = job;
  return { id, name, where, target, file, pass, resume, landed, reported };
}

let active = 0;
function pump() {
  for (const job of useTransfers.getState().uploads) {
    if (active >= CONCURRENT) return;
    if (job.state !== "waiting") continue;
    active++;
    patch(job.id, { state: "uploading", progress: 0, note: undefined, retryable: undefined });
    void run(job.id).finally(() => {
      active--;
      pump();
    });
  }
}

const current = (id: string) => useTransfers.getState().uploads.find((u) => u.id === id);

async function run(id: string) {
  for (let attempt = 1; ; attempt++) {
    const job = current(id);
    if (!job) return; // Taken off the list (signed out).
    // What the sender keeps between tries, written to the device as it goes.
    const progress: Progress = { pass: job.pass, resume: job.resume, landed: job.landed };
    try {
      await send({
        file: job.file,
        name: job.name,
        target: job.target,
        progress,
        onProgress: (p) => patch(id, { progress: p }),
        keep: (change) => {
          Object.assign(progress, change);
          patch(id, change);
          const now = current(id);
          if (now) void keepUpload(saved(now));
        },
      });
      patch(id, { state: "done", progress: 1, note: undefined });
      useTransfers.setState((s) => ({ finished: s.finished + 1 }));
      await forgetUpload(id);
      return;
    } catch (err) {
      const note = err instanceof Error ? err.message : "Upload failed.";
      const refused = err instanceof Refused;
      if (refused || attempt >= TRIES) {
        patch(id, { state: "failed", note, retryable: !refused });
        // Refused ones stay listed until dismissed, but aren't kept to resume.
        if (refused) await forgetUpload(id);
        else await tellTrouble(id);
        return;
      }
      patch(id, { note: `Connection trouble, trying again (${attempt + 1} of ${TRIES})…` });
      await new Promise((r) => setTimeout(r, attempt * 4000));
    }
  }
}

// An order photo still not in after its tries: the order's history, the
// uploader and the office are told, once, so nobody is left guessing.
async function tellTrouble(id: string) {
  const job = current(id);
  if (!job || job.reported || job.target.kind !== "order-item") return;
  const told = await reportUploadTrouble(job.target.orderItemId, job.name).catch(() => ({ ok: false }));
  if (!told.ok) return;
  patch(id, { reported: true });
  const now = current(id);
  if (now) await keepUpload(saved(now));
}

export type NewUpload = { file: File; target: UploadTarget; where: string; name?: string };

/** Starts uploads in the background; returns their ids (for whenUploaded / useUploads). */
export function startUploads(items: NewUpload[]): string[] {
  const jobs: UploadJob[] = items.map(({ file, target, where, name }) => ({ id: crypto.randomUUID(), name: name ?? file.name, where, target, file, state: "waiting", progress: 0 }));
  useTransfers.setState((s) => ({ uploads: [...s.uploads, ...jobs] }));
  // Kept on the device first, so one that finishes isn't saved again after it's forgotten.
  void Promise.all(jobs.map((j) => keepUpload(saved(j)))).then(pump);
  return jobs.map((j) => j.id);
}

/** Starts uploading `files` to a Drive folder, in the background. */
export function uploadToDrive(via: Via, folderId: string | null, where: string, files: File[]) {
  startUploads(files.map((file) => ({ file, where, target: { kind: "drive", via, folderId } })));
}

const settled = (u: UploadJob | undefined) => !u || u.state === "done" || u.state === "failed" || u.state === "paused";

/** Resolves once each of these is in or has stopped (failed, paused, gone): how many got in. */
export function whenUploaded(ids: string[]): Promise<{ done: number; failed: number }> {
  return new Promise((resolve) => {
    const check = () => {
      const jobs = ids.map(current);
      if (!jobs.every(settled)) return false;
      const done = jobs.filter((u) => u?.state === "done").length;
      resolve({ done, failed: ids.length - done });
      return true;
    };
    if (check()) return;
    const stop = useTransfers.subscribe(() => check() && stop());
  });
}

/** The uploads going to targets like this one, for the page they belong to. */
export function useUploads(match: (target: UploadTarget) => boolean): UploadJob[] {
  const uploads = useTransfers((s) => s.uploads);
  return uploads.filter((u) => match(u.target));
}

/** Uploads still going: a reload now would cut them off. */
export const uploadsGoing = (s: Transfers = useTransfers.getState()) => s.uploads.some((u) => u.state === "waiting" || u.state === "uploading");

/** Failed and paused uploads go again (only those the connection failed, when `retryableOnly`). */
export function retryUploads(retryableOnly = false, ids?: string[]) {
  useTransfers.setState((s) => ({
    uploads: s.uploads.map((u) =>
      (!ids || ids.includes(u.id)) && (u.state === "paused" || (u.state === "failed" && (!retryableOnly || u.retryable)))
        ? { ...u, state: "waiting", progress: 0, note: undefined }
        : u,
    ),
  }));
  pump();
}

/** Takes finished, failed and paused ones off the list (paused and failed ones are forgotten on this device). */
export function clearUploads() {
  const gone = useTransfers.getState().uploads.filter((u) => u.state !== "waiting" && u.state !== "uploading");
  useTransfers.setState((s) => ({ uploads: s.uploads.filter((u) => !gone.includes(u)) }));
  gone.forEach((u) => void forgetUpload(u.id));
}

/**
 * Uploads left unfinished on an earlier visit. Order photos carry on by
 * themselves (the order is waiting for them); the rest are shown paused and
 * go only when the person says so.
 */
let restored = false;
export async function restoreUploads() {
  if (restored) return;
  restored = true;
  const back = await savedUploads();
  const known = new Set(useTransfers.getState().uploads.map((u) => u.id));
  const jobs: UploadJob[] = back
    .filter((u) => !known.has(u.id))
    .map((u) => ({ ...u, state: RESUMES_BY_ITSELF.includes(u.target.kind) ? "waiting" : "paused", progress: 0 }));
  if (!jobs.length) return;
  useTransfers.setState((s) => ({ uploads: [...jobs, ...s.uploads] }));
  pump();
}

/** On signing out: nothing of this person's stays on the device for the next one. */
export async function forgetTransfers() {
  useTransfers.setState({ uploads: [], zips: [] });
  await forgetAllUploads();
}

/** Makes a zip download in the background; `work` reports how it's going. */
export function zipInBackground(name: string, work: (status: (note: string | null) => void) => Promise<void>) {
  const id = crypto.randomUUID();
  const set = (change: Partial<ZipJob>) => useTransfers.setState((s) => ({ zips: s.zips.map((z) => (z.id === id ? { ...z, ...change } : z)) }));
  useTransfers.setState((s) => ({ zips: [...s.zips, { id, name, state: "working", note: "Getting the list…" }] }));
  work((note) => note && set({ note })).then(
    () => set({ state: "done", note: "Downloaded." }),
    (err: unknown) => set({ state: "failed", note: err instanceof Error ? err.message : "The zip couldn't be made." }),
  );
}

export function dismissZip(id: string) {
  useTransfers.setState((s) => ({ zips: s.zips.filter((z) => z.id !== id) }));
}
