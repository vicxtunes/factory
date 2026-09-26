"use client";

// Uploads one file (or a recorded audio Blob) straight to Supabase Storage
// for a conversation, with progress. The result is passed to sendMessage(),
// which re-verifies the object server-side before recording it.
//
// Voice messages: record with MediaRecorder, wrap the Blob in a File
// (new File([blob], "voice.webm", { type: blob.type })) and pass the
// recording length as `durationMs` and its bar heights as `waveform`
// (see ./waveform.ts).

import { putToSignedUrl } from "@/lib/storage/xhr-upload";

import { createAttachmentUpload } from "../actions";
import { CHAT_LIMITS, isAllowedAttachmentType } from "../policy";
import type { UploadedAttachment } from "../types";

export type ChatUploadResult = { ok: true; attachment: UploadedAttachment } | { ok: false; error: string };

/** Reads an image's natural size so the UI can reserve space before it loads. */
function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export async function uploadChatAttachment(
  conversationId: string,
  file: File,
  options: { durationMs?: number; waveform?: number[] | null; onProgress?: (fraction: number) => void } = {},
): Promise<ChatUploadResult> {
  const mimeType = file.type || "application/octet-stream";
  if (!isAllowedAttachmentType(mimeType)) return { ok: false, error: `"${file.name}" isn't a supported file type.` };
  if (file.size > CHAT_LIMITS.maxAttachmentBytes) {
    return { ok: false, error: `"${file.name}" is larger than ${CHAT_LIMITS.maxAttachmentBytes / 1024 / 1024}MB.` };
  }

  const session = await createAttachmentUpload({ conversationId, fileName: file.name, mimeType, sizeBytes: file.size });
  if (!session.ok) return session;

  const [put, size] = await Promise.all([
    putToSignedUrl(session.data.bucket, session.data.path, session.data.token, file, options.onProgress ?? (() => {})),
    imageSize(file),
  ]);
  if (!put.ok) return put;

  return {
    ok: true,
    attachment: {
      path: session.data.path,
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
      width: size?.width ?? null,
      height: size?.height ?? null,
      durationMs: options.durationMs ?? null,
      waveform: options.waveform ?? null,
    },
  };
}
