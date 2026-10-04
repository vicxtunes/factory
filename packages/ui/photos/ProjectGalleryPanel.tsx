"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { whatsappNumber } from "@repo/lib/kernel/core/phone";
import { openProjectGallery, shareProjectGallery, stopSharingProjectGallery } from "@repo/lib/photos/actions";
import type { AlbumView, PhotoView, Usage } from "@repo/lib/photos/core";

import { ManagePhotos } from "./AlbumControls";
import { PhotoUploader } from "./PhotoUploader";
import { UsageBar } from "./UsageBar";

/**
 * On a project: its photos for the client. A private gallery the client sees
 * on their portal page, and that the studio can share by a link (no sign-in),
 * optionally until a given day.
 */
export function ProjectGalleryPanel({
  projectId,
  album,
  photos,
  usage,
  shareUrl,
  clientPhone,
}: {
  projectId: string;
  album: AlbumView | null;
  photos: PhotoView[];
  usage: Usage;
  /** The current share link, if it's shared. */
  shareUrl: string | null;
  clientPhone: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(shareUrl);
  const [expires, setExpires] = useState(album?.shareExpiresOn ?? "");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const run = (work: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, after?: (data: unknown) => void) => {
    setError(null);
    start(async () => {
      const res = await work();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      after?.(res.data);
      router.refresh();
    });
  };

  if (!album) {
    return (
      <section className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <p className="text-sm">Deliver the finished photos here: your client sees them on their page and can download them.</p>
        <Button type="button" loading={pending} onClick={() => run(() => openProjectGallery(projectId))}>
          Create photo gallery
        </Button>
        {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      </section>
    );
  }

  const wa = link ? `https://wa.me/${whatsappNumber(clientPhone)}?text=${encodeURIComponent(`Your photos are ready: ${link}`)}` : null;

  return (
    <div className="space-y-3">
      <UsageBar usage={usage} />
      <PhotoUploader albumId={album.id} />
      <ManagePhotos albumId={album.id} coverPhotoId={album.coverPhotoId} photos={photos} />
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <p className="text-sm font-semibold">Share by link</p>
        <p className="text-xs text-muted">Your client already sees these photos on their page. A link lets family view and download them without signing in.</p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Works until (optional)">
            <TextInput type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
          <Button type="button" variant="secondary" loading={pending} onClick={() => run(() => shareProjectGallery(album.id, expires || null), (url) => setLink(url as string))}>
            {link ? "Make a new link" : "Make a link"}
          </Button>
          {link ? (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => stopSharingProjectGallery(album.id), () => setLink(null))}>
              Stop sharing
            </Button>
          ) : null}
        </div>
        {link ? (
          <div className="space-y-2">
            <p className="break-all rounded-[var(--radius)] bg-background px-3 py-2 text-xs text-muted">{link}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </Button>
              {wa ? (
                <a href={wa} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-[var(--radius)] bg-success-500 px-4 text-sm text-white hover:bg-success-600">
                  Send on WhatsApp
                </a>
              ) : null}
            </div>
            <p className="text-xs text-muted">Making a new link stops the old one working.</p>
          </div>
        ) : null}
      </section>
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
