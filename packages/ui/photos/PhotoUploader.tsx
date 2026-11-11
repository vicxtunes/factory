"use client";

import { UploadRow } from "@repo/ui/UploadRow";
import { UploadThumbs } from "@repo/ui/UploadThumbs";

import { retryUploads, startUploads, useUploads } from "../transfers/store";

/**
 * Adds photos to an album: each is resized in the browser, uploaded straight
 * to storage and then checked and recorded by the server against the
 * studio's allowance. It all happens in the background (packages/ui/transfers):
 * the person can leave the page; the transfers panel follows them.
 */
export function PhotoUploader({ albumId }: { albumId: string }) {
  const jobs = useUploads((t) => t.kind === "album-photo" && t.albumId === albumId);

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <UploadRow
        label="Add photos"
        hint="Resized for the web before they upload, so they take far less space — or drop them here"
        accept="image/*"
        multiple
        disabled={false}
        onFiles={(files) => void startUploads([...files].map((file) => ({ file, where: "Album", target: { kind: "album-photo", albumId } })))}
      />
      <UploadThumbs
        items={jobs.map((j) => ({
          key: j.id,
          file: j.file,
          // Waiting and resizing show as an empty ring: it's on its way.
          state: j.state === "done" ? "done" : j.state === "failed" || j.state === "paused" ? "failed" : "uploading",
          progress: j.progress,
          error: j.note,
        }))}
        onRetry={(key) => retryUploads(false, [key])}
      />
    </section>
  );
}
