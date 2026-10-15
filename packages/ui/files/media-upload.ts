// Adding files to a service's or product's Business folder: photos go into
// its media album the way the Services page adds them (resized in the
// browser, uploaded straight to storage, checked by the server), and a video
// becomes its preview video. Anything else is refused.

import { confirmPhotoUpload, confirmVideoUpload, openServiceGallery, startPhotoUpload, startVideoUpload } from "@repo/lib/photos/actions";
import { formatBytes, MAX_FILES_PER_BATCH, MAX_VIDEO_BYTES, VIDEO_TYPES, type VideoContentType } from "@repo/lib/photos/core";
import { putSigned, resizeForUpload } from "@repo/ui/photos/browser";

export type MediaProgress = (i: number, patch: { state?: "uploading" | "done" | "failed"; progress?: number; error?: string }) => void;

const isVideo = (type: string): type is VideoContentType => type in VIDEO_TYPES;

/** Uploads `files` (in this order, reporting each by its index) into a service's media; returns a problem to show, if any. */
export async function uploadServiceMedia(serviceId: string, albumId: string | null, files: File[], update: MediaProgress): Promise<string | null> {
  const photos = files.map((file, i) => ({ file, i })).filter(({ file }) => file.type.startsWith("image/"));
  const videos = files.map((file, i) => ({ file, i })).filter(({ file }) => isVideo(file.type));
  files.forEach((file, i) => {
    if (!file.type.startsWith("image/") && !isVideo(file.type)) update(i, { state: "failed", error: "Only photos and a video go here." });
  });
  // One preview video: the first one chosen.
  videos.slice(1).forEach(({ i }) => update(i, { state: "failed", error: "One video at a time: it replaces the preview video." }));
  if (photos.length === 0 && videos.length === 0) return "Only photos and a video (MP4, WebM or MOV) go in a service's folder.";

  let album = albumId;
  if (!album) {
    const opened = await openServiceGallery(serviceId);
    if (!opened.ok) return opened.error;
    album = opened.data;
  }

  let problem: string | null = null;
  for (let from = 0; from < photos.length; from += MAX_FILES_PER_BATCH) {
    const batch = photos.slice(from, from + MAX_FILES_PER_BATCH);
    const resized: { r: Awaited<ReturnType<typeof resizeForUpload>>; i: number }[] = [];
    for (const { file, i } of batch) {
      update(i, { state: "uploading", progress: 0 });
      try {
        resized.push({ r: await resizeForUpload(file), i });
      } catch {
        update(i, { state: "failed", error: "Not a photo this browser can open." });
      }
    }
    if (resized.length === 0) continue;
    const res = await startPhotoUpload({ albumId: album, files: resized.map(({ r }) => ({ largeBytes: r.large.size, thumbBytes: r.thumb.size })) });
    if (!res.ok) {
      resized.forEach(({ i }) => update(i, { state: "failed", error: "Not uploaded." }));
      problem = res.error;
      break;
    }
    for (const [k, { r, i }] of resized.entries()) {
      const ticket = res.data[k];
      try {
        let large = 0;
        let thumb = 0;
        const total = r.large.size + r.thumb.size;
        const report = () => update(i, { progress: (large * r.large.size + thumb * r.thumb.size) / total });
        await Promise.all([putSigned(ticket.largeUrl, r.large, (f) => ((large = f), report())), putSigned(ticket.thumbUrl, r.thumb, (f) => ((thumb = f), report()))]);
        const done = await confirmPhotoUpload({ albumId: album, photoId: ticket.photoId, width: r.width, height: r.height, caption: "" });
        update(i, done.ok ? { state: "done", progress: 1 } : { state: "failed", error: done.error });
      } catch (err) {
        update(i, { state: "failed", error: err instanceof Error ? err.message : "Upload failed." });
      }
    }
  }

  const video = videos[0];
  if (video) {
    const { file, i } = video;
    if (file.size > MAX_VIDEO_BYTES) {
      update(i, { state: "failed", error: `Choose a video under ${formatBytes(MAX_VIDEO_BYTES)}.` });
    } else {
      update(i, { state: "uploading", progress: 0 });
      try {
        const ticket = await startVideoUpload({ albumId: album, bytes: file.size, contentType: file.type });
        if (!ticket.ok) {
          update(i, { state: "failed", error: ticket.error });
        } else {
          await putSigned(ticket.data.url, file, (progress) => update(i, { progress }), file.type);
          const done = await confirmVideoUpload({ albumId: album, videoId: ticket.data.videoId, contentType: file.type });
          update(i, done.ok ? { state: "done", progress: 1 } : { state: "failed", error: done.error });
        }
      } catch (err) {
        update(i, { state: "failed", error: err instanceof Error ? err.message : "Upload failed." });
      }
    }
  }
  return problem;
}
