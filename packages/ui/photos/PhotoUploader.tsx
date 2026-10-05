"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { UploadRow } from "@repo/ui/UploadRow";
import { UploadThumbs } from "@repo/ui/UploadThumbs";
import { confirmPhotoUpload, startPhotoUpload } from "@repo/lib/photos/actions";
import { MAX_FILES_PER_BATCH } from "@repo/lib/photos/core";

import { putSigned, resizeForUpload } from "./browser";

type Status = { file: File; state: "waiting" | "resizing" | "uploading" | "done" | "failed"; progress: number; error?: string };

/** Runs `work` over `items`, `limit` at a time. */
async function pool<T>(items: T[], limit: number, work: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await work(items[i], i);
    }
  }));
}

/**
 * Adds photos to an album: each is resized in the browser, uploaded straight
 * to storage (signed links, a few at a time) and then checked and recorded by
 * the server against the studio's allowance.
 */
export function PhotoUploader({ albumId }: { albumId: string }) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Status>) => setStatuses((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function upload(files: File[]) {
    setBusy(true);
    setError(null);
    setStatuses(files.map((f) => ({ file: f, state: "waiting", progress: 0 })));
    for (let start = 0; start < files.length; start += MAX_FILES_PER_BATCH) {
      const batch = files.slice(start, start + MAX_FILES_PER_BATCH);
      // Resize the batch first: the server checks the allowance against these sizes.
      const resized: (Awaited<ReturnType<typeof resizeForUpload>> | null)[] = [];
      for (const [k, file] of batch.entries()) {
        update(start + k, { state: "resizing" });
        try {
          resized.push(await resizeForUpload(file));
        } catch {
          resized.push(null);
          update(start + k, { state: "failed", error: "Not a photo this browser can open." });
        }
      }
      const ready = resized.map((r, k) => ({ r, k })).filter((x) => x.r !== null) as { r: NonNullable<(typeof resized)[number]>; k: number }[];
      if (ready.length === 0) continue;
      const res = await startPhotoUpload({ albumId, files: ready.map(({ r }) => ({ largeBytes: r.large.size, thumbBytes: r.thumb.size })) });
      if (!res.ok) {
        setError(res.error);
        ready.forEach(({ k }) => update(start + k, { state: "failed", error: "Not uploaded." }));
        break;
      }
      await pool(ready, 3, async ({ r, k }, i) => {
        const ticket = res.data[i];
        const at = start + k;
        update(at, { state: "uploading" });
        try {
          let large = 0;
          let thumb = 0;
          const total = r.large.size + r.thumb.size;
          const report = () => update(at, { progress: (large * r.large.size + thumb * r.thumb.size) / total });
          await Promise.all([
            putSigned(ticket.largeUrl, r.large, (f) => ((large = f), report())),
            putSigned(ticket.thumbUrl, r.thumb, (f) => ((thumb = f), report())),
          ]);
          const done = await confirmPhotoUpload({ albumId, photoId: ticket.photoId, width: r.width, height: r.height, caption: "" });
          update(at, done.ok ? { state: "done", progress: 1 } : { state: "failed", error: done.error });
        } catch (err) {
          update(at, { state: "failed", error: err instanceof Error ? err.message : "Upload failed." });
        }
      });
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <UploadRow
        label="Add photos"
        hint="Resized for the web before they upload, so they take far less space — or drop them here"
        accept="image/*"
        multiple
        disabled={busy}
        onFiles={(files) => upload([...files])}
      />
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <UploadThumbs
        items={statuses.map((s, i) => ({
          key: String(i),
          file: s.file,
          // Waiting and resizing show as an empty ring: it's on its way.
          state: s.state === "done" ? "done" : s.state === "failed" ? "failed" : "uploading",
          progress: s.progress,
          error: s.error,
        }))}
      />
    </section>
  );
}
