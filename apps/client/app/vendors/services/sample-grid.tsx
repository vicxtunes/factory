"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Lightbox } from "@repo/ui/Lightbox";
import { putSigned } from "@repo/ui/photos/browser";
import { UploadRow } from "@repo/ui/UploadRow";
import { UploadThumbs, uploadKey, type UploadThumb } from "@repo/ui/UploadThumbs";
import { confirmVendorSample, deleteVendorSample, startVendorSampleUpload } from "@repo/lib/vendors/actions";
import { SAMPLE_EDGE, SAMPLES_PER_SERVICE } from "@repo/lib/vendors/core";

import { shrinkPicture } from "../shrink-picture";

/**
 * A service's samples, with the app's standard upload (design room →
 * Uploads & downloads): an Upload row (button or drop), each picked picture
 * a thumbnail with its progress ring, a tick when it's in and Retry if it
 * failed; shrunk in the browser and sent a few at a time. The samples it has
 * show as album photos do (tap to view, Delete under each).
 */
export function SampleGrid({ offerId, samples }: { offerId: string; samples: { id: string; url: string | null }[] }) {
  const router = useRouter();
  const [uploads, setUploads] = useState<UploadThumb[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();
  const busy = uploads.some((u) => u.state === "uploading");
  const room = SAMPLES_PER_SERVICE - samples.length;
  const shown = samples.flatMap((s) => (s.url ? [{ key: s.id, src: s.url, alt: "A sample of this service" }] : []));

  const update = (key: string, patch: Partial<UploadThumb>) => setUploads((all) => all.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  async function send(item: UploadThumb) {
    update(item.key, { state: "uploading", progress: 0, error: undefined });
    try {
      const blob = await shrinkPicture(item.file, SAMPLE_EDGE);
      const ticket = await startVendorSampleUpload(offerId);
      if (!ticket.ok) throw new Error(ticket.error);
      await putSigned(ticket.data.url, blob, (progress) => update(item.key, { progress }));
      const done = await confirmVendorSample(offerId, ticket.data.key);
      if (!done.ok) throw new Error(done.error);
      update(item.key, { state: "done", progress: 1 });
    } catch (e) {
      update(item.key, { state: "failed", error: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  async function upload(files: File[]) {
    setError(null);
    const fits = files.slice(0, room);
    if (files.length > room) setError(`A service shows up to ${SAMPLES_PER_SERVICE} samples: the first ${room} are being added.`);
    const items: UploadThumb[] = fits.map((file) => ({ key: uploadKey(file), file, state: "uploading", progress: 0 }));
    setUploads(items);
    // Three at a time, like album uploads.
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, items.length) }, async () => {
        while (next < items.length) await send(items[next++]!);
      }),
    );
    router.refresh();
  }

  const progress = busy && uploads.length ? uploads.reduce((sum, u) => sum + (u.state === "uploading" ? (u.progress ?? 0) : 1), 0) / uploads.length : null;

  return (
    <div className="space-y-3">
      {room > 0 ? (
        <UploadRow
          label="Add samples"
          hint={`Your best work for this service, up to ${room} more. Shrunk before they upload — or drop them here`}
          accept="image/*"
          multiple
          disabled={busy}
          progress={progress}
          onFiles={(files) => upload([...files])}
        />
      ) : (
        <p className="rounded-xl bg-background p-3 text-xs text-muted">This service has {SAMPLES_PER_SERVICE} samples, the most it shows. Delete one to add another.</p>
      )}
      {uploads.length ? (
        <UploadThumbs
          items={uploads}
          onRetry={(key) => {
            const item = uploads.find((u) => u.key === key);
            if (item) void send(item).then(() => router.refresh());
          }}
        />
      ) : null}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}

      {samples.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(8rem,100%),1fr))] gap-2">
          {samples.map((s) => {
            const at = shown.findIndex((p) => p.key === s.id);
            return (
              <li key={s.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                <button type="button" onClick={() => at >= 0 && setViewing(at)} className="block w-full" aria-label="View this sample">
                  {s.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage links, already resized
                    <img src={s.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  ) : (
                    <span className="block aspect-square w-full bg-gray-100 dark:bg-white/5" />
                  )}
                </button>
                <div className="p-2 text-xs">
                  <button
                    type="button"
                    disabled={removing || busy}
                    onClick={() =>
                      window.confirm("Delete this sample?") &&
                      startRemoving(async () => {
                        const res = await deleteVendorSample(s.id);
                        if (!res.ok) setError(res.error);
                        router.refresh();
                      })
                    }
                    className="text-error-600 hover:underline disabled:opacity-50 dark:text-error-400"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : uploads.length ? null : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">No samples yet. Studios see them before they hire you.</p>
      )}

      <Lightbox photos={shown} index={viewing} onIndexChange={setViewing} onClose={() => setViewing(null)} />
    </div>
  );
}
