"use client";

import { useState } from "react";

import { UploadRow } from "@repo/ui/UploadRow";
import { confirmMediaUpload, createMediaUpload } from "@repo/lib/social/actions";
import type { PostMedia } from "@repo/lib/social/core";
import { putToSignedUrl } from "@repo/lib/storage/xhr-upload";

const BUCKET = "social-media";
const MAX = 10;

// A post's photos and videos (the design room's Upload row): straight from
// the browser to the public social-media bucket, where Zernio fetches them.
export function MediaPicker({ value, onChange, onBusy }: { value: PostMedia[]; onChange: (next: PostMedia[]) => void; onBusy: (busy: boolean) => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: File[]) {
    setError(null);
    onBusy(true);
    let next = value;
    for (const file of files.slice(0, MAX - value.length)) {
      setProgress(0);
      const session = await createMediaUpload(file.name);
      if (!session.ok) {
        setError(session.error);
        break;
      }
      const sent = await putToSignedUrl(BUCKET, session.path, session.token, file, setProgress);
      if (!sent.ok) {
        setError(sent.error);
        break;
      }
      const done = await confirmMediaUpload(session.path);
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
    <div className="space-y-2">
      {value.length ? (
        <div className="grid grid-cols-4 gap-2">
          {value.map((m, i) => (
            <div key={m.url} className="group relative aspect-square overflow-hidden rounded-xl bg-gray-100 dark:bg-white/5">
              {m.type === "video" ? (
                <video src={m.url} className="size-full object-cover" muted playsInline preload="metadata" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- the uploaded photo
                <img src={m.url} alt="" className="size-full object-cover" />
              )}
              {m.type === "video" ? <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">VIDEO</span> : null}
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
        </div>
      ) : null}
      {value.length < MAX ? (
        <UploadRow
          label="Photos or video"
          hint="JPG, PNG, WebP, MP4 or MOV · up to 300 MB"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          multiple
          disabled={progress !== null}
          progress={progress}
          onFiles={(files) => void upload([...files])}
        />
      ) : null}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
    </div>
  );
}
