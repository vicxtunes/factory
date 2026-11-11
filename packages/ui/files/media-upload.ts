// Adding files to a service's or product's Business folder: photos go into
// its media album the way the Services page adds them (resized in the
// browser, uploaded straight to storage, checked by the server), and a video
// becomes its preview video. Anything else is refused. They upload in the
// background (packages/ui/transfers), shown in the transfers panel.

import { openServiceGallery } from "@repo/lib/photos/actions";
import { formatBytes, MAX_VIDEO_BYTES, VIDEO_TYPES, type VideoContentType } from "@repo/lib/photos/core";

import { startUploads, type NewUpload } from "../transfers/store";

const isVideo = (type: string): type is VideoContentType => type in VIDEO_TYPES;

/** Starts uploading `files` into a service's media; returns a problem to show, if any. */
export async function uploadServiceMedia(serviceId: string, albumId: string | null, files: File[]): Promise<string | null> {
  const photos = files.filter((file) => file.type.startsWith("image/"));
  // One preview video: the first one chosen.
  const video = files.find((file) => isVideo(file.type));
  const problems: string[] = [];
  if (files.some((file) => !file.type.startsWith("image/") && !isVideo(file.type))) problems.push("Only photos and a video (MP4, WebM or MOV) go in a service's folder.");
  if (files.filter((file) => isVideo(file.type)).length > 1) problems.push("One video at a time: the first replaces the preview video.");
  const videoOk = video && video.size <= MAX_VIDEO_BYTES;
  if (video && !videoOk) problems.push(`Choose a video under ${formatBytes(MAX_VIDEO_BYTES)}.`);
  if (!photos.length && !videoOk) return problems.join(" ") || null;

  let album = albumId;
  if (!album) {
    const opened = await openServiceGallery(serviceId);
    if (!opened.ok) return opened.error;
    album = opened.data;
  }
  const uploads: NewUpload[] = photos.map((file) => ({ file, where: "Service photos", target: { kind: "album-photo", albumId: album } }));
  if (videoOk) uploads.push({ file: video, where: "Preview video", target: { kind: "album-video", albumId: album } });
  startUploads(uploads);
  return problems.join(" ") || null;
}
