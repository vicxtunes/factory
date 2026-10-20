"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { confirmVendorSample, deleteVendorSample, startVendorSampleUpload } from "@repo/lib/vendors/actions";
import { SAMPLE_EDGE, SAMPLES_PER_SERVICE } from "@repo/lib/vendors/core";

import { shrinkPicture } from "../shrink-picture";

/** A service's samples: the pictures in a grid, each removable, and adding more (several at once, one after another). */
export function SampleGrid({ offerId, samples }: { offerId: string; samples: { id: string; url: string | null }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; of: number } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const room = SAMPLES_PER_SERVICE - samples.length;

  async function upload(files: File[]) {
    setError(null);
    const chosen = files.slice(0, room);
    setUploading({ done: 0, of: chosen.length });
    try {
      for (const [i, file] of chosen.entries()) {
        const blob = await shrinkPicture(file, SAMPLE_EDGE);
        const ticket = await startVendorSampleUpload(offerId);
        if (!ticket.ok) throw new Error(ticket.error);
        const put = await fetch(ticket.data.url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: blob });
        if (!put.ok) throw new Error("The upload failed. Check the connection and try again.");
        const done = await confirmVendorSample(offerId, ticket.data.key);
        if (!done.ok) throw new Error(done.error);
        setUploading({ done: i + 1, of: chosen.length });
      }
      if (files.length > room) setError(`A service shows up to ${SAMPLES_PER_SERVICE} samples: the first ${room} were added.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed.");
    } finally {
      setUploading(null);
      if (input.current) input.current.value = "";
      router.refresh();
    }
  }

  async function remove(id: string) {
    setError(null);
    setRemoving(id);
    const res = await deleteVendorSample(id);
    if (!res.ok) setError(res.error);
    setRemoving(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files?.length && upload([...e.target.files])} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {samples.map((s) => (
          <div key={s.id} className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface">
            {s.url ? (
              // A short-lived signed link to the private bucket: a plain img.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.url} alt="" className="size-full object-cover" />
            ) : null}
            <button
              type="button"
              onClick={() => remove(s.id)}
              disabled={removing !== null || uploading !== null}
              aria-label="Remove this sample"
              className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 disabled:opacity-60"
            >
              {removing === s.id ? (
                <span className="size-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              )}
            </button>
          </div>
        ))}
        {room > 0 ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={uploading !== null}
            className="grid aspect-[4/3] place-items-center rounded-2xl border border-dashed border-border bg-surface text-sm font-medium text-muted hover:border-brand-500/50 hover:text-foreground disabled:opacity-60"
          >
            <span className="flex flex-col items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              {uploading ? `Uploading ${uploading.done + 1} of ${uploading.of}…` : "Add samples"}
            </span>
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        {samples.length}/{SAMPLES_PER_SERVICE} samples. Your best work for this service: studios see it before they hire you.
      </p>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
