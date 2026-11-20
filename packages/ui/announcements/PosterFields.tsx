"use client";

import { useRef, useState } from "react";

import { Field, TextInput } from "@repo/ui/Field";
import { DEFAULT_BUTTON_LABEL } from "@repo/lib/announcements/core";
import { confirmPosterUpload, createPosterUpload } from "@repo/lib/announcements/poster-upload-actions";
import { MARKETING_MEDIA_BUCKET } from "@repo/lib/storage/client";
import { putToSignedUrl } from "@repo/lib/storage/xhr-upload";

export interface Poster {
  imageUrl: string | null;
  buttonLabel: string;
  linkUrl: string;
}

export const emptyPoster: Poster = { imageUrl: null, buttonLabel: "", linkUrl: "" };

// The designed part of an announcement (owner, 2026-11-21): a poster made
// elsewhere and uploaded here, and a button that opens a link. Used on
// Aming's announcements page and a business's own.
export function PosterFields({ value, onChange }: { value: Poster; onChange: (next: Poster) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setProgress(0);
    const done = await (async () => {
      const session = await createPosterUpload(file.name);
      if (!session.ok) return session;
      const sent = await putToSignedUrl(MARKETING_MEDIA_BUCKET, session.path, session.token, file, setProgress);
      return sent.ok ? confirmPosterUpload(session.path) : sent;
    })();
    setProgress(null);
    if (!done.ok) return setError(done.error);
    onChange({ ...value, imageUrl: done.url });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-xs font-medium text-muted">Poster (optional)</p>
        {value.imageUrl ? (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- the uploaded poster */}
            <img src={value.imageUrl} alt="" className="max-h-40 w-28 rounded-lg border border-border object-cover" />
            <div className="flex flex-col gap-2 text-xs">
              <button type="button" className="text-left text-brand-600" onClick={() => input.current?.click()}>
                Change poster
              </button>
              <button type="button" className="text-left text-muted" onClick={() => onChange({ ...value, imageUrl: null })}>
                Remove poster
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={progress !== null}
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted hover:bg-background"
          >
            {progress !== null ? `Uploading… ${Math.round(progress * 100)}%` : "Upload a designed poster"}
            <span className="text-xs">JPG, PNG or WebP, under 10 MB. A tall one (4:5) looks best.</span>
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        {error ? <p className="mt-1 text-xs text-error-600">{error}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Button opens (optional)">
          <TextInput inputMode="url" value={value.linkUrl} placeholder="aming.ug/offers" maxLength={500} onChange={(e) => onChange({ ...value, linkUrl: e.target.value })} />
        </Field>
        <Field label="Button says">
          <TextInput value={value.buttonLabel} placeholder={DEFAULT_BUTTON_LABEL} maxLength={40} onChange={(e) => onChange({ ...value, buttonLabel: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}
