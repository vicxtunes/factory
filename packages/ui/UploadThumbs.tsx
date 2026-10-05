"use client";

import { useEffect, useRef } from "react";

import { CheckCircleIcon, CloseIcon, DocumentIcon } from "./media/icons";

/** More previews than this would slow a phone down (a whole wedding); the rest show as "+N". */
const MAX_SHOWN = 30;

export type UploadThumbState = "selected" | "uploading" | "done" | "failed";

export interface UploadThumb {
  key: string;
  file: File;
  state: UploadThumbState;
  /** 0–1 while uploading. */
  progress?: number;
  error?: string;
}

/** Stable per-file key for a picked file (same file picked twice = same key). */
export function uploadKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toUpperCase().slice(0, 4) : "FILE";
}

/** A local preview of a picked image — instant, nothing is downloaded. */
function LocalPreview({ file }: { file: File }) {
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (img.current) img.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // eslint-disable-next-line @next/next/no-img-element -- local blob: preview
  return <img ref={img} alt={file.name} className="h-full w-full object-cover" />;
}

function ProgressRing({ value }: { value: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="opacity-30" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        className="transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}

function RetryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

function Thumb({ item, onRemove, onRetry }: { item: UploadThumb; onRemove?: () => void; onRetry?: () => void }) {
  const pct = Math.round((item.progress ?? 0) * 100);

  return (
    <li
      title={item.error ? `${item.file.name} — ${item.error}` : item.file.name}
      className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-background shadow-theme-xs ${
        item.state === "failed" ? "border-error-500" : "border-border"
      }`}
    >
      {item.file.type.startsWith("image/") ? (
        <LocalPreview file={item.file} />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-muted">
          <DocumentIcon className="h-6 w-6" />
          <span className="text-[9px] font-semibold tracking-wide">{extensionOf(item.file.name)}</span>
        </span>
      )}

      {item.state === "uploading" ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
          <ProgressRing value={item.progress ?? 0} />
          <span className="absolute text-[9px] font-semibold">{pct}%</span>
        </span>
      ) : null}

      {item.state === "done" ? (
        <span className="absolute bottom-1 right-1 inline-flex rounded-full bg-white text-success-600 shadow">
          <CheckCircleIcon className="h-4 w-4" />
        </span>
      ) : null}

      {item.state === "failed" ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={!onRetry}
          aria-label={`Retry ${item.file.name}`}
          className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-error-600/70 text-[9px] font-semibold text-white"
        >
          <RetryIcon className="h-5 w-5" />
          {onRetry ? "Retry" : "Failed"}
        </button>
      ) : null}

      {item.state === "selected" && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.file.name}`}
          className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
        >
          <CloseIcon className="h-3 w-3" />
        </button>
      ) : null}
    </li>
  );
}

// The files of an upload as small thumbnails, shown the moment they're
// picked (a local preview, nothing downloaded): ✕ to drop one before it's
// sent, a progress ring while it uploads, a tick when it's in, Retry if it
// failed. Sits under an UploadRow — one look for every upload in the app.
export function UploadThumbs({
  items,
  onRemove,
  onRetry,
}: {
  items: UploadThumb[];
  onRemove?: (key: string) => void;
  onRetry?: (key: string) => void;
}) {
  if (items.length === 0) return null;

  const done = items.filter((i) => i.state === "done").length;
  const failed = items.filter((i) => i.state === "failed").length;
  const uploading = items.some((i) => i.state === "uploading");
  const selected = items.every((i) => i.state === "selected");

  const summary = selected
    ? `${items.length} ${items.length === 1 ? "file" : "files"} ready`
    : uploading
      ? `Uploading ${done} of ${items.length}…`
      : failed > 0
        ? `${done} of ${items.length} uploaded · ${failed} failed`
        : `${done} ${done === 1 ? "file" : "files"} uploaded`;

  return (
    <div className="space-y-1.5">
      <ul className="flex flex-wrap gap-2">
        {items.slice(0, MAX_SHOWN).map((item) => (
          <Thumb
            key={item.key}
            item={item}
            onRemove={onRemove ? () => onRemove(item.key) : undefined}
            onRetry={onRetry ? () => onRetry(item.key) : undefined}
          />
        ))}
        {items.length > MAX_SHOWN ? (
          <li className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-background text-sm font-semibold text-muted">
            +{items.length - MAX_SHOWN}
          </li>
        ) : null}
      </ul>
      <p className={`text-xs ${failed > 0 && !uploading ? "text-error-600 dark:text-error-400" : "text-muted"}`}>{summary}</p>
    </div>
  );
}
