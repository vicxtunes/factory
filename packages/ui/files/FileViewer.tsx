"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Swiper as Slider } from "swiper";
import { Keyboard, Virtual } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

import "swiper/css";
import "swiper/css/virtual";

import { Button } from "@repo/ui/Button";
import { commentOnFile, deleteComment, fileComments, resolveComment } from "@repo/lib/files/actions";
import { COMMENT_AUTHOR_LABELS, type FileComment, type FileView, type Via } from "@repo/lib/files/core";
import { formatBytes } from "@repo/lib/photos/core";
import { formatDay } from "@repo/lib/tenancy/format";
import { Watermark } from "@repo/ui/files/proof";
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
function Stage({
  file,
  pins,
  placing,
  onPlace,
  watermark,
}: {
  file: FileView;
  pins: { n: number; x: number; y: number; open: boolean }[];
  placing: boolean;
  onPlace: (x: number, y: number) => void;
  /** Proofs: a watermark across it, no saving it from the page. */
  watermark?: string;
}) {
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
          className={`max-h-[calc(100dvh-8rem)] max-w-full object-contain select-none [-webkit-touch-callout:none] ${placing ? "cursor-crosshair" : ""}`}
        />
        {watermark ? <Watermark text={watermark} large /> : null}
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
  if (url && file.contentType.startsWith("video/")) {
    return (
      <div className="relative" data-proof={watermark ? "" : undefined}>
        <video src={url} controls controlsList={watermark ? "nodownload noplaybackrate" : undefined} disablePictureInPicture={!!watermark} className="max-h-[calc(100dvh-8rem)] max-w-full" />
        {watermark ? <Watermark text={watermark} large /> : null}
      </div>
    );
  }
  // A PDF's own viewer can save it: proofs don't open it here.
  if (url && file.contentType === "application/pdf" && !watermark) return <iframe src={url} title={file.name} className="h-[calc(100dvh-8rem)] w-full rounded-lg bg-white" />;
  return (
    <div className="space-y-2 text-center text-white/80">
      <p className="text-5xl font-semibold">{file.name.includes(".") ? file.name.split(".").pop()!.toUpperCase() : "FILE"}</p>
      <p className="text-sm">
        {file.downloadUrl
          ? "No preview for this kind of file: download it to open it."
          : file.contentType.startsWith("image/")
            ? "The preview of this photo is being prepared: look again in a minute."
            : "Shared with you to look at, without downloads."}
      </p>
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
  watermark,
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
  /** Proofs (still in production): watermarked, nothing to save from the page. */
  watermark?: string;
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
  /** Narrower than a laptop: details and comments are a sheet over the photo, opened from the bar below it. */
  const [sheet, setSheet] = useState(false);
  const slider = useRef<Slider | null>(null);
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
      // The arrow keys are the slider's.
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [onClose]);

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
    <div role="dialog" aria-modal="true" aria-label={file.name} className="fixed inset-0 z-50 flex flex-col bg-gray-950 lg:flex-row lg:bg-gray-950/95">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-white">
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 hover:bg-white/10">
            ✕
          </button>
          <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
          <span className="text-xs text-white/60">
            {index + 1} of {files.length}
          </span>
        </div>
        {/*
          Swiper: the photo follows the finger and snaps to the next, with
          momentum; mouse drag and the arrow keys too. Only the photos near
          this one are in the page (virtual), so a big folder stays smooth.
          Held still while a comment is being pinned.
        */}
        <div className="relative min-h-0 flex-1">
          <Swiper
            className="!absolute inset-0"
            modules={[Virtual, Keyboard]}
            virtual={{ addSlidesBefore: 1, addSlidesAfter: 1 }}
            keyboard={{ enabled: true }}
            initialSlide={index}
            spaceBetween={24}
            grabCursor
            allowTouchMove={!placing}
            onSwiper={(s) => (slider.current = s)}
            onSlideChange={(s) => go(s.activeIndex)}
          >
            {files.map((f, i) => (
              <SwiperSlide key={f.id} virtualIndex={i} className="!flex items-center justify-center lg:p-3">
                <Stage
                  file={f}
                  pins={i === index ? pins : []}
                  placing={i === index && placing}
                  watermark={watermark}
                  onPlace={(x, y) => (setPin({ x, y }), setPlacing(false), setSheet(true), panel.current?.querySelector("textarea")?.focus())}
                />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
        {placing ? <p className="absolute inset-x-0 top-12 text-center text-sm text-white lg:hidden">Tap the spot on the photo</p> : null}
        {index > 0 ? (
          <button type="button" aria-label="Previous" onClick={() => slider.current?.slidePrev()} className="absolute top-1/2 left-2 z-10 hidden rounded-full bg-black/40 px-3 py-2 text-xl text-white hover:bg-black/60 sm:block">
            ‹
          </button>
        ) : null}
        {index < files.length - 1 ? (
          <button type="button" aria-label="Next" onClick={() => slider.current?.slideNext()} className="absolute top-1/2 right-2 z-10 hidden rounded-full bg-black/40 px-3 py-2 text-xl text-white hover:bg-black/60 sm:block">
            ›
          </button>
        ) : null}
        {/* Narrower than a laptop: what you can do, under the photo; details and comments open as a sheet. */}
        <div className="flex items-center gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm text-white lg:hidden">
          {extra?.(file)}
          {commentable || file.downloadUrl ? (
            <button type="button" onClick={() => setSheet(true)} className="ml-auto rounded-full bg-white/10 px-4 py-2 font-medium active:bg-white/20">
              {commentable ? `💬 Comments${(comments ?? []).filter((c) => !c.resolvedAt).length ? ` (${(comments ?? []).filter((c) => !c.resolvedAt).length})` : ""}` : "Download"}
            </button>
          ) : null}
        </div>
      </div>

      {sheet ? <button type="button" aria-label="Close" onClick={() => setSheet(false)} className="fixed inset-0 z-10 bg-black/40 lg:hidden" /> : null}
      <aside
        ref={panel}
        className={`${sheet ? "fixed inset-x-0 bottom-0 z-20 flex max-h-[80dvh] rounded-t-2xl shadow-2xl" : "hidden"} w-full flex-col bg-surface pb-[env(safe-area-inset-bottom)] text-sm lg:static lg:z-auto lg:flex lg:max-h-none lg:w-96 lg:rounded-none lg:border-l lg:border-border lg:pb-0 lg:shadow-none`}
      >
        <div className="flex justify-center pt-2 lg:hidden">
          <button type="button" aria-label="Close" onClick={() => setSheet(false)} className="h-1.5 w-10 rounded-full bg-border" />
        </div>
        <div className="space-y-2 border-b border-border p-4">
          <p className="text-xs text-muted">
            {formatBytes(file.bytes)}
            {file.createdAt ? ` · ${formatDay(scope, file.createdAt)}` : ""}
          </p>
          {file.caption && !extra ? <p className="text-sm font-medium">{file.caption}</p> : null}
          <div className="flex flex-wrap gap-2">
            {file.downloadUrl ? (
              <a href={file.downloadUrl} className="inline-flex min-h-9 items-center rounded-[var(--radius)] border border-border px-3 text-sm hover:bg-background">
                {file.optimisedUrl ? "Download original" : "Download"}
              </a>
            ) : null}
            {file.optimisedUrl ? (
              <a
                href={file.optimisedUrl}
                title="The 1,600 px copy: quick to send and share"
                className="inline-flex min-h-9 items-center rounded-[var(--radius)] border border-border px-3 text-sm hover:bg-background"
              >
                Download optimised
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
                        <Button
                          size="sm"
                          variant="secondary"
                          type="button"
                          onClick={() => act(() => resolveComment(via, c.id, !c.resolvedAt), () => setComments((all) => all!.map((x) => (x.id === c.id ? { ...x, resolvedAt: x.resolvedAt ? null : new Date().toISOString() } : x))))}
                        >
                          {c.resolvedAt ? "Open again" : "Resolve"}
                        </Button>
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
                    // On a phone the sheet steps aside so the photo can be tapped.
                    onClick={() => (pin ? setPin(null) : (setPlacing(!placing), setSheet(false)))}
                    className={`rounded-lg px-2 py-1 text-xs ${placing || pin ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300" : "text-muted hover:bg-background"}`}
                  >
                    {pin ? "Unpin" : placing ? "Tap the picture…" : "📍 Pin to a spot"}
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
