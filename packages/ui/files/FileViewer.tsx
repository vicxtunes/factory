"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@repo/ui/Button";
import { commentOnFile, deleteComment, fileComments, resolveComment } from "@repo/lib/files/actions";
import { COMMENT_AUTHOR_LABELS, type FileComment, type FileView, type Via } from "@repo/lib/files/core";
import { formatBytes } from "@repo/lib/photos/core";
import { formatDay } from "@repo/lib/tenancy/format";
import type { TenantScope } from "@repo/lib/tenancy/types";

const GUEST_KEY = "files-guest-name";

function readGuestName(): string {
  try {
    return window.localStorage.getItem(GUEST_KEY) ?? "";
  } catch {
    return "";
  }
}

/** The file itself, as big as it fits: a picture (with its comments' pins), a video, a PDF, or what it is with Download. */
function Stage({ file, pins, placing, onPlace }: { file: FileView; pins: { n: number; x: number; y: number; open: boolean }[]; placing: boolean; onPlace: (x: number, y: number) => void }) {
  const url = file.previewUrl;
  if (url && file.contentType.startsWith("image/")) {
    return (
      <div className="relative inline-block max-h-full max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived storage link */}
        <img
          src={url}
          alt={file.name}
          draggable={false}
          onClick={(e) => {
            if (!placing) return;
            const r = e.currentTarget.getBoundingClientRect();
            onPlace((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
          }}
          className={`max-h-[calc(100dvh-8rem)] max-w-full object-contain select-none ${placing ? "cursor-crosshair" : ""}`}
        />
        {pins.map((p) => (
          <span
            key={p.n}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            className={`pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-semibold text-white shadow ring-2 ring-white ${p.open ? "bg-brand-500" : "bg-gray-500"}`}
          >
            {p.n}
          </span>
        ))}
      </div>
    );
  }
  if (url && file.contentType.startsWith("video/")) return <video src={url} controls className="max-h-[calc(100dvh-8rem)] max-w-full" />;
  if (url && file.contentType === "application/pdf") return <iframe src={url} title={file.name} className="h-[calc(100dvh-8rem)] w-full rounded-lg bg-white" />;
  return (
    <div className="space-y-2 text-center text-white/80">
      <p className="text-5xl font-semibold">{file.name.includes(".") ? file.name.split(".").pop()!.toUpperCase() : "FILE"}</p>
      <p className="text-sm">{file.downloadUrl ? "No preview for this kind of file: download it to open it." : "Shared with you to look at, without downloads."}</p>
    </div>
  );
}

/**
 * A file opened from Files: as big as it fits, with Previous / Next (and the
 * arrow keys) through the folder, Download, and its comments, which anyone
 * who can see it can add (pinned to a point on a picture, or not). The
 * business and editors resolve them; the business deletes them.
 */
export function FileViewer({
  files,
  index,
  via,
  scope,
  canResolve,
  canDelete,
  extra,
  onIndex,
  onClose,
  onChanged,
}: {
  files: FileView[];
  index: number;
  via: Via;
  scope: Pick<TenantScope, "locale" | "timeZone">;
  canResolve: boolean;
  canDelete: boolean;
  /** More controls for the open file, beside Download. */
  extra?: (file: FileView) => ReactNode;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** After a comment changes, so counts on the tiles follow. */
  onChanged: () => void;
}) {
  const file = files[index];
  const [comments, setComments] = useState<FileComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [guestName, setGuestName] = useState(readGuestName);
  const [sending, setSending] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // Comments are for stored files; a Business photo has none.
  const commentable = !file.media;

  useEffect(() => {
    let live = true;
    if (commentable) {
      fileComments(via, file.id).then((res) => {
        if (!live) return;
        if (res.ok) setComments(res.data);
        else setError(res.error);
      });
    }
    return () => {
      live = false;
    };
  }, [via, file.id, commentable]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < files.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    }
    document.addEventListener("keydown", onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [index, files.length, onIndex, onClose]);

  function go(i: number) {
    setComments(null);
    setError(null);
    setPin(null);
    setPlacing(false);
    onIndex(i);
  }

  async function send() {
    setError(null);
    setSending(true);
    const name = guestName.trim();
    if (via.as === "link" && name) {
      try {
        window.localStorage.setItem(GUEST_KEY, name);
      } catch {}
    }
    const res = await commentOnFile(via, file.id, { body, pin, guestName: via.as === "link" ? name : undefined });
    setSending(false);
    if (!res.ok) return setError(res.error);
    setComments((c) => [...(c ?? []), res.data]);
    setBody("");
    setPin(null);
    setPlacing(false);
    onChanged();
  }

  async function act(work: () => Promise<{ ok: boolean; error?: string }>, after: () => void) {
    setError(null);
    const res = await work();
    if (!res.ok) return setError(res.error ?? "Something went wrong.");
    after();
    onChanged();
  }

  const visible = (comments ?? []).filter((c) => showResolved || !c.resolvedAt);
  const resolvedCount = (comments ?? []).filter((c) => c.resolvedAt).length;
  // Pins are numbered in the order they were made, resolved ones greyed.
  const pinned = (comments ?? []).filter((c) => c.pin);
  const pinNumber = new Map(pinned.map((c, i) => [c.id, i + 1]));
  const pins = pinned.filter((c) => showResolved || !c.resolvedAt).map((c) => ({ n: pinNumber.get(c.id)!, x: c.pin!.x, y: c.pin!.y, open: !c.resolvedAt }));
  if (pin) pins.push({ n: pinned.length + 1, x: pin.x, y: pin.y, open: true });

  return (
    <div role="dialog" aria-modal="true" aria-label={file.name} className="fixed inset-0 z-50 flex flex-col bg-gray-950/95 lg:flex-row">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-white">
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 hover:bg-white/10">
            ✕
          </button>
          <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
          <span className="hidden text-xs text-white/60 sm:inline">
            {index + 1} of {files.length}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-3">
          <Stage file={file} pins={pins} placing={placing} onPlace={(x, y) => (setPin({ x, y }), setPlacing(false), panel.current?.querySelector("textarea")?.focus())} />
        </div>
        {index > 0 ? (
          <button type="button" aria-label="Previous" onClick={() => go(index - 1)} className="absolute top-1/2 left-2 rounded-full bg-black/40 px-3 py-2 text-xl text-white hover:bg-black/60">
            ‹
          </button>
        ) : null}
        {index < files.length - 1 ? (
          <button type="button" aria-label="Next" onClick={() => go(index + 1)} className="absolute top-1/2 right-2 rounded-full bg-black/40 px-3 py-2 text-xl text-white hover:bg-black/60">
            ›
          </button>
        ) : null}
      </div>

      <aside ref={panel} className="flex max-h-[45dvh] w-full flex-col border-t border-border bg-surface text-sm lg:max-h-none lg:w-96 lg:border-t-0 lg:border-l">
        <div className="space-y-2 border-b border-border p-4">
          <p className="text-xs text-muted">
            {formatBytes(file.bytes)}
            {file.createdAt ? ` · ${formatDay(scope, file.createdAt)}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {file.downloadUrl ? (
              <a href={file.downloadUrl} className="inline-flex min-h-9 items-center rounded-[var(--radius)] border border-border px-3 text-sm hover:bg-background">
                Download
              </a>
            ) : null}
            {extra?.(file)}
          </div>
        </div>

        {commentable ? (
          <>
            <div className="flex items-center justify-between px-4 pt-3">
              <h3 className="font-medium">Comments</h3>
              {resolvedCount ? (
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
                  Show resolved ({resolvedCount})
                </label>
              ) : null}
            </div>
            <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {comments === null && !error ? <li className="text-muted">Loading…</li> : null}
              {comments && visible.length === 0 ? <li className="text-muted">No comments yet. Say what you think, or pin a note to a spot on the picture.</li> : null}
              {visible.map((c) => (
                <li key={c.id} className={`space-y-1 rounded-xl border border-border p-3 ${c.resolvedAt ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-2 text-xs">
                    {pinNumber.has(c.id) ? (
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white ${c.resolvedAt ? "bg-gray-500" : "bg-brand-500"}`}>{pinNumber.get(c.id)}</span>
                    ) : null}
                    <span className="font-medium">{c.author.name}</span>
                    <span className="text-muted">{COMMENT_AUTHOR_LABELS[c.author.kind]}</span>
                    <span className="ml-auto text-muted">{formatDay(scope, c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-line">{c.body}</p>
                  {canResolve || canDelete ? (
                    <div className="flex gap-3 text-xs">
                      {canResolve ? (
                        <button
                          type="button"
                          className="text-brand-600 hover:underline"
                          onClick={() => act(() => resolveComment(via, c.id, !c.resolvedAt), () => setComments((all) => all!.map((x) => (x.id === c.id ? { ...x, resolvedAt: x.resolvedAt ? null : new Date().toISOString() } : x))))}
                        >
                          {c.resolvedAt ? "Open again" : "Resolve"}
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="text-muted hover:text-error-600"
                          onClick={() => window.confirm("Delete this comment?") && act(() => deleteComment(via, c.id), () => setComments((all) => all!.filter((x) => x.id !== c.id)))}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
            <form
              className="space-y-2 border-t border-border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              {via.as === "link" ? (
                <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your name" maxLength={60} required className="min-h-9 w-full rounded-lg border border-border bg-background px-2" />
              ) : null}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
                }}
                rows={2}
                maxLength={2000}
                placeholder={pin ? "What about this spot?" : "Add a comment…"}
                className="w-full resize-none rounded-lg border border-border bg-background p-2"
              />
              <div className="flex flex-wrap items-center gap-2">
                {file.previewUrl && file.contentType.startsWith("image/") ? (
                  <button
                    type="button"
                    onClick={() => (pin ? setPin(null) : setPlacing(!placing))}
                    className={`rounded-lg px-2 py-1 text-xs ${placing || pin ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300" : "text-muted hover:bg-background"}`}
                  >
                    {pin ? "Unpin" : placing ? "Click the picture…" : "📍 Pin to a spot"}
                  </button>
                ) : null}
                <Button type="submit" className="ml-auto min-h-9" disabled={!body.trim() || sending} loading={sending}>
                  Comment
                </Button>
              </div>
            </form>
          </>
        ) : null}
        {error ? <p className="px-4 pb-3 text-error-600 dark:text-error-400">{error}</p> : null}
      </aside>
    </div>
  );
}
