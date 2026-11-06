"use client";

// Uploads and zip downloads that carry on while the person moves around the
// app: they live here, not in the page that started them, and show in the
// transfers panel (TransferTray, in each app's root layout).
//
// Each Drive file asks for its own upload link just before it goes (links
// last 15 minutes; asking for 20 at once let the last ones expire on a slow
// connection), is tried 3 times, and is kept on the device until it's in
// (./saved.ts).
import { create } from "zustand";

import { confirmFileUpload, startFileUpload } from "@repo/lib/files/actions";
import type { Via } from "@repo/lib/files/core";

import { putSigned } from "../photos/browser";
import { forgetAllUploads, forgetUpload, keepUpload, savedUploads } from "./saved";

export type UploadJob = {
  id: string;
  name: string;
  folderId: string | null;
  via: Via;
  where: string;
  file: File;
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

/** Aming said no (no space, no right to add here…): trying again won't help. */
class Refused extends Error {}

function patch(id: string, change: Partial<UploadJob>) {
  useTransfers.setState((s) => ({ uploads: s.uploads.map((u) => (u.id === id ? { ...u, ...change } : u)) }));
}

let active = 0;
function pump() {
  for (const job of useTransfers.getState().uploads) {
    if (active >= CONCURRENT) return;
    if (job.state !== "waiting") continue;
    active++;
    patch(job.id, { state: "uploading", progress: 0, note: undefined, retryable: undefined });
    void send(job).finally(() => {
      active--;
      pump();
    });
  }
}

async function send(job: UploadJob) {
  // Once the file has landed, a retry only confirms it: no second upload.
  let landed: { fileId: string; contentType: string } | null = null;
  for (let attempt = 1; ; attempt++) {
    try {
      if (!landed) {
        const start = await startFileUpload(job.via, { folderId: job.folderId, files: [{ name: job.name, bytes: job.file.size, contentType: job.file.type }] });
        if (!start.ok) throw new Refused(start.error);
        const ticket = start.data[0];
        await putSigned(ticket.url, job.file, (progress) => patch(job.id, { progress }), ticket.contentType);
        landed = { fileId: ticket.fileId, contentType: ticket.contentType };
      }
      const done = await confirmFileUpload(job.via, { folderId: job.folderId, fileId: landed.fileId, name: job.name, contentType: landed.contentType });
      if (!done.ok) throw new Refused(done.error);
      patch(job.id, { state: "done", progress: 1, note: undefined });
      useTransfers.setState((s) => ({ finished: s.finished + 1 }));
      await forgetUpload(job.id);
      return;
    } catch (err) {
      const note = err instanceof Error ? err.message : "Upload failed.";
      if (err instanceof Refused || attempt >= TRIES) {
        patch(job.id, { state: "failed", note, retryable: !(err instanceof Refused) });
        // Refused ones stay listed until dismissed, but aren't kept to resume.
        if (err instanceof Refused) await forgetUpload(job.id);
        return;
      }
      patch(job.id, { progress: 0, note: `Connection trouble, trying again (${attempt + 1} of ${TRIES})…` });
      await new Promise((r) => setTimeout(r, attempt * 4000));
    }
  }
}

/** Starts uploading `files` to a Drive folder, in the background. */
export async function uploadToDrive(via: Via, folderId: string | null, where: string, files: File[]) {
  const jobs: UploadJob[] = files.map((file) => ({ id: crypto.randomUUID(), name: file.name, folderId, via, where, file, state: "waiting", progress: 0 }));
  useTransfers.setState((s) => ({ uploads: [...s.uploads, ...jobs] }));
  // Kept on the device first, so one that finishes isn't saved again after it's forgotten.
  await Promise.all(jobs.map(({ id, name, folderId, via, where, file }) => keepUpload({ id, name, folderId, via, where, file })));
  pump();
}

/** Failed and paused uploads go again (only those the connection failed, when `retryableOnly`). */
export function retryUploads(retryableOnly = false) {
  useTransfers.setState((s) => ({
    uploads: s.uploads.map((u) =>
      u.state === "paused" || (u.state === "failed" && (!retryableOnly || u.retryable)) ? { ...u, state: "waiting", progress: 0, note: undefined } : u,
    ),
  }));
  pump();
}

/** Takes finished, failed and paused ones off the list (paused ones are forgotten on this device). */
export function clearUploads() {
  const gone = useTransfers.getState().uploads.filter((u) => u.state !== "waiting" && u.state !== "uploading");
  useTransfers.setState((s) => ({ uploads: s.uploads.filter((u) => !gone.includes(u)) }));
  gone.forEach((u) => void forgetUpload(u.id));
}

/** Uploads left unfinished on an earlier visit, shown paused: they go only when the person says so. */
let restored = false;
export async function restoreUploads() {
  if (restored) return;
  restored = true;
  const saved = await savedUploads();
  const known = new Set(useTransfers.getState().uploads.map((u) => u.id));
  const back: UploadJob[] = saved.filter((u) => !known.has(u.id)).map((u) => ({ ...u, state: "paused", progress: 0 }));
  if (back.length) useTransfers.setState((s) => ({ uploads: [...back, ...s.uploads] }));
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
