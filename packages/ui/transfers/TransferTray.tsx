"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "../Button";
import { clearUploads, dismissZip, restoreUploads, retryUploads, useTransfers, type UploadJob } from "./store";

const LABEL: Record<UploadJob["state"], string> = { waiting: "Waiting", uploading: "", done: "Uploaded", failed: "Not uploaded", paused: "Not finished" };

// The uploads and zips going on in the background (./store.ts), on every
// page: a card at the bottom right on a computer, a strip above the bottom
// bar on a phone. It opens to the list; it can only be closed once nothing is
// still going.
export function TransferTray() {
  const router = useRouter();
  const uploads = useTransfers((s) => s.uploads);
  const zips = useTransfers((s) => s.zips);
  const finished = useTransfers((s) => s.finished);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void restoreUploads();
    const back = () => retryUploads(true);
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, []);

  // The page shows the new files: once a second at most while they come in.
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => router.refresh(), 1000);
    return () => clearTimeout(t);
  }, [finished, router]);

  const going = uploads.filter((u) => u.state === "waiting" || u.state === "uploading");
  const zipping = zips.some((z) => z.state === "working");
  const busy = going.length > 0 || zipping;

  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  if (!uploads.length && !zips.length) return null;

  const done = uploads.filter((u) => u.state === "done").length;
  const failed = uploads.filter((u) => u.state === "failed").length;
  const paused = uploads.filter((u) => u.state === "paused").length;
  const bytes = going.reduce((sum, u) => sum + u.file.size, 0);
  const sent = going.reduce((sum, u) => sum + u.file.size * u.progress, 0);

  const summary = going.length
    ? `Uploading ${going.length} file${going.length === 1 ? "" : "s"}${bytes ? ` · ${Math.round((sent / bytes) * 100)}%` : ""}`
    : paused
      ? `${paused} upload${paused === 1 ? "" : "s"} didn't finish`
      : failed
        ? `${failed} not uploaded`
        : zipping
          ? "Making a zip…"
          : uploads.length
            ? `${done} uploaded`
            : "Zips";

  return (
    <section
      aria-label="Uploads and downloads"
      className="fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 rounded-2xl border border-border bg-surface shadow-theme-lg print:hidden sm:left-auto sm:right-4 sm:w-96 lg:bottom-4"
    >
      <div className="flex items-center gap-2 p-3">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-h-9 min-w-0 flex-1 truncate text-left text-sm font-medium">
          <span className={failed && !going.length ? "text-error-600 dark:text-error-400" : ""}>{summary}</span>
          <span className="ml-2 text-xs text-muted">{open ? "Hide" : "Show"}</span>
        </button>
        {paused ? (
          <Button size="sm" onClick={() => retryUploads()}>
            Resume
          </Button>
        ) : failed && !going.length ? (
          <Button size="sm" variant="secondary" onClick={() => retryUploads()}>
            Try again
          </Button>
        ) : null}
        {!busy ? (
          <button
            type="button"
            aria-label="Close"
            className="flex min-h-9 min-w-9 items-center justify-center rounded-[var(--radius)] text-muted hover:bg-background"
            onClick={() => {
              clearUploads();
              zips.forEach((z) => dismissZip(z.id));
              setOpen(false);
            }}
          >
            ✕
          </button>
        ) : null}
      </div>
      {going.length ? (
        <div className="mx-3 mb-3 h-1 overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${bytes ? Math.round((sent / bytes) * 100) : 0}%` }} />
        </div>
      ) : null}
      {busy && !open ? <p className="-mt-1 px-3 pb-3 text-xs text-muted">You can keep using Aming. Don&apos;t close this tab until it&apos;s done.</p> : null}

      {open ? (
        <ul className="max-h-[50dvh] space-y-2 overflow-y-auto border-t border-border p-3">
          {zips.map((z) => (
            <li key={z.id} className="space-y-0.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">{z.name}.zip</span>
                {z.state !== "working" ? (
                  <button type="button" className="shrink-0 text-xs text-muted hover:underline" onClick={() => dismissZip(z.id)}>
                    Remove
                  </button>
                ) : null}
              </div>
              <p className={`text-xs ${z.state === "failed" ? "text-error-600 dark:text-error-400" : "text-muted"}`}>{z.note}</p>
            </li>
          ))}
          {uploads.map((u) => (
            <li key={u.id} className="space-y-1 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">
                  {u.name} <span className="text-xs text-muted">→ {u.where}</span>
                </span>
                <span className={`shrink-0 text-xs ${u.state === "failed" ? "text-error-600 dark:text-error-400" : "text-muted"}`}>
                  {u.state === "uploading" ? `${Math.round(u.progress * 100)}%` : LABEL[u.state]}
                </span>
              </div>
              {u.state === "uploading" ? (
                <div className="h-1 overflow-hidden rounded-full bg-background">
                  <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                </div>
              ) : null}
              {u.note ? <p className={`text-xs ${u.state === "failed" ? "text-error-600 dark:text-error-400" : "text-muted"}`}>{u.note}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
