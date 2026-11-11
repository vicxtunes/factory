"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Lightbox } from "@repo/ui/Lightbox";
import { UploadRow } from "@repo/ui/UploadRow";
import { UploadThumbs, type UploadThumb } from "@repo/ui/UploadThumbs";
import { retryUploads, startUploads, useUploads } from "@repo/ui/transfers/store";
import { deleteVendorSample } from "@repo/lib/vendors/actions";
import { SAMPLES_PER_SERVICE } from "@repo/lib/vendors/core";
import { Button } from "@repo/ui/Button";

/**
 * A service's samples, with the app's standard upload (design room →
 * Uploads & downloads): an Upload row (button or drop), each picked picture
 * a thumbnail with its progress ring, a tick when it's in and Retry if it
 * failed; shrunk in the browser and sent a few at a time. The samples it has
 * show as album photos do (tap to view, Delete under each).
 */
export function SampleGrid({ offerId, samples }: { offerId: string; samples: { id: string; url: string | null }[] }) {
  const router = useRouter();
  const [viewing, setViewing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();
  // Shrunk and sent in the background (packages/ui/transfers): the vendor can
  // leave the page; the transfers panel follows them.
  const jobs = useUploads((t) => t.kind === "vendor-sample" && t.offerId === offerId);
  const uploads: UploadThumb[] = jobs.map((j) => ({
    key: j.id,
    file: j.file,
    state: j.state === "done" ? "done" : j.state === "failed" || j.state === "paused" ? "failed" : "uploading",
    progress: j.progress,
    error: j.note,
  }));
  const busy = uploads.some((u) => u.state === "uploading");
  const going = jobs.filter((j) => j.state === "waiting" || j.state === "uploading").length;
  const room = SAMPLES_PER_SERVICE - samples.length - going;
  const shown = samples.flatMap((s) => (s.url ? [{ key: s.id, src: s.url, alt: "A sample of this service" }] : []));

  function upload(files: File[]) {
    setError(null);
    const fits = files.slice(0, Math.max(0, room));
    if (files.length > fits.length) setError(`A service shows up to ${SAMPLES_PER_SERVICE} samples: the first ${fits.length} are being added.`);
    startUploads(fits.map((file) => ({ file, where: "Service samples", target: { kind: "vendor-sample", offerId } })));
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
          onRetry={(key) => retryUploads(false, [key])}
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
                  <Button
                    size="sm"
                    variant="danger"
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
                  >
                    Delete
                  </Button>
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
