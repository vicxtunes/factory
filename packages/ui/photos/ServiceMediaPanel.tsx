"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { UploadRow } from "@repo/ui/UploadRow";
import { confirmVideoUpload, openServiceGallery, removeServiceVideo, startVideoUpload } from "@repo/lib/photos/actions";
import { formatBytes, MAX_VIDEO_BYTES, VIDEO_TYPES, type AlbumView, type PhotoView, type Usage, type VideoContentType } from "@repo/lib/photos/core";

import { ManagePhotos } from "./AlbumControls";
import { putSigned } from "./browser";
import { PhotoUploader } from "./PhotoUploader";
import { UsageBar } from "./UsageBar";

const isVideoType = (type: string): type is VideoContentType => type in VIDEO_TYPES;

/** The preview video: upload (or replace) one file, with progress, or remove it. */
function PreviewVideo({ album }: { album: AlbumView }) {
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = progress != null || pending;

  async function upload(files: FileList) {
    const file = files[0];
    setError(null);
    if (!file) return;
    if (!isVideoType(file.type)) return setError("Choose an MP4, WebM or MOV video.");
    if (file.size > MAX_VIDEO_BYTES) return setError(`That video is ${formatBytes(file.size)}. Choose one under ${formatBytes(MAX_VIDEO_BYTES)}.`);
    setProgress(0);
    try {
      const ticket = await startVideoUpload({ albumId: album.id, bytes: file.size, contentType: file.type });
      if (!ticket.ok) return setError(ticket.error);
      await putSigned(ticket.data.url, file, setProgress, file.type);
      const done = await confirmVideoUpload({ albumId: album.id, videoId: ticket.data.videoId, contentType: file.type });
      if (!done.ok) return setError(done.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  }

  function remove() {
    if (!window.confirm("Remove the preview video?")) return;
    setError(null);
    start(async () => {
      const res = await removeServiceVideo(album.id);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {album.videoUrl ? (
        <div className="space-y-2">
          <video src={album.videoUrl} controls preload="metadata" className="max-h-72 w-full rounded-xl bg-black" />
          <div className="flex items-center justify-between gap-3 text-xs text-muted">
            <span>{album.videoBytes != null ? formatBytes(album.videoBytes) : null}</span>
            <Button type="button" variant="ghost" disabled={busy} onClick={remove}>
              Remove video
            </Button>
          </div>
        </div>
      ) : null}
      <UploadRow
        label={album.videoUrl ? "Replace the preview video" : "Preview video"}
        hint={`MP4, WebM or MOV, up to ${formatBytes(MAX_VIDEO_BYTES)}. A short clip plays best.`}
        accept={Object.keys(VIDEO_TYPES).join(",")}
        disabled={busy}
        progress={progress}
        onFiles={upload}
      />
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}

/**
 * On a service: what the showroom shows of it. A cover and a gallery (the
 * first photo is the cover until another is chosen) and a preview video, in
 * a private album of its own that counts toward the studio's storage.
 */
export function ServiceMediaPanel({
  serviceId,
  album,
  photos,
  usage,
}: {
  serviceId: string;
  album: AlbumView | null;
  photos: PhotoView[];
  usage: Usage;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!album) {
    return (
      <section className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
        <p className="text-sm">Add photos and a preview video: your showroom shows them with this service&apos;s packages.</p>
        <Button
          type="button"
          loading={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await openServiceGallery(serviceId);
              if (!res.ok) return setError(res.error);
              router.refresh();
            })
          }
        >
          Add photos and video
        </Button>
        {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <UsageBar usage={usage} />
      <PreviewVideo album={album} />
      <PhotoUploader albumId={album.id} />
      <ManagePhotos albumId={album.id} coverPhotoId={album.coverPhotoId} photos={photos} />
    </div>
  );
}
