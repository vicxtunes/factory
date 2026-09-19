"use client";

import { useRef, useState } from "react";

function UploadCloudIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 15.75a4.5 4.5 0 0 1-1.406-8.775 5.25 5.25 0 0 1 10.233-2.33 3.75 3.75 0 0 1 4.123 4.985A4.502 4.502 0 0 1 18.75 15.75M9 12.75 12 9.75m0 0 3 3m-3-3v9"
      />
    </svg>
  );
}

// Compact upload control: a labelled row with a "Choose file" button and its
// own drag-and-drop target, plus an inline progress bar when a numeric
// `progress` is supplied. One shared design for every "choose a file to
// upload" point in the app (order photos, product/marketing media, CSV
// import) instead of each screen rolling its own plain `<input type=file>` —
// originally built for app/dashboard/product-panel.tsx's product media
// panel, promoted here once every other upload point needed the same look.
export function UploadRow({
  label,
  hint,
  accept,
  multiple,
  disabled,
  progress,
  onFiles,
}: {
  label: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  disabled: boolean;
  // Omit (or pass null) when the underlying upload doesn't report progress —
  // the row still works, it just won't switch its hint text to a percentage.
  progress?: number | null;
  onFiles: (files: FileList) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const uploading = progress != null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled && e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      }}
      className={`flex items-center justify-between gap-3 rounded-xl border-2 border-dashed px-3 py-2.5 transition-colors ${
        dragOver ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-border bg-background"
      }`}
    >
      <UploadCloudIcon className={`h-5 w-5 shrink-0 ${dragOver ? "text-brand-600" : "text-muted"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className="truncate text-[0.65rem] text-muted">
          {uploading ? `Uploading… ${Math.round((progress ?? 0) * 100)}%` : hint}
        </p>
        {uploading ? (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-brand-500 transition-[width] duration-150"
              style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
            />
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        className="shrink-0 rounded-[var(--radius)] border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-background disabled:opacity-50"
      >
        Choose file
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
