"use client";

import { useRef, useState } from "react";

import { confirmMediaUpload, createMediaUpload } from "@repo/lib/social/actions";
import type { PostMedia } from "@repo/lib/social/core";
import { putToSignedUrl } from "@repo/lib/storage/xhr-upload";

const BUCKET = "social-media";
const MAX = 10;

// A post's photos and videos: straight from the browser to the public
// social-media bucket (Zernio fetches them from there when it posts).
export function MediaPicker({ value, onChange, onBusy }: { value: PostMedia[]; onChange: (next: PostMedia[]) => void; onBusy: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: File[]) {
    setError(null);
    onBusy(true);
    let next = value;
    for (const file of files.slice(0, MAX - value.length)) {
      setProgress(0);
      const done = await (async () => {
        const session = await createMediaUpload(file.name);
        if (!session.ok) return session;
        const sent = await putToSignedUrl(BUCKET, session.path, session.token, file, setProgress);
        return sent.ok ? confirmMediaUpload(session.path) : sent;
      })();
      if (!done.ok) {
        setError(done.error);
        break;
      }
      next = [...next, { url: done.url, type: done.type }];
      onChange(next);
    }
    setProgress(null);
    onBusy(false);
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">Photos or video</p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {value.map((m, i) => (
          <div key={m.url} className="relative">
            {m.type === "video" ? (
              <video src={m.url} className="aspect-square w-full rounded-lg bg-black object-cover" muted playsInline preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- the uploaded photo
              <img src={m.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
            )}
            <button
              type="button"
              aria-label="Remove"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
            >
              ✕
            </button>
          </div>
        ))}
        {value.length < MAX ? (
          <button
            type="button"
            disabled={progress !== null}
            onClick={() => input.current?.click()}
            className="flex aspect-square w-full flex-col items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted hover:bg-background"
          >
            {progress !== null ? `${Math.round(progress * 100)}%` : "+ Add"}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted">Up to {MAX}. Photos JPG, PNG or WebP; video MP4 or MOV, under 300 MB.</p>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void upload(files);
        }}
      />
      {error ? <p className="mt-1 text-xs text-error-600">{error}</p> : null}
    </div>
  );
}
