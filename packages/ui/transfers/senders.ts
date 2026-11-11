// How each kind of upload gets where it's going. The queue (./store.ts) runs
// them in the background, retries and keeps them on the device; a sender only
// knows its own steps: ask the server for a pass, send the file, have the
// server check and record it.
//
// A sender throws Refused when Aming said no (trying again won't help) and
// any other error when the connection failed. It saves its progress through
// `keep` (the pass it got, a piece-by-piece upload's address, that the file
// landed), so a retry, or the next visit, carries on instead of starting over.
import { confirmFileUpload, startFileUpload } from "@repo/lib/files/actions";
import type { Via } from "@repo/lib/files/core";
import { confirmPhotoUpload, confirmVideoUpload, startPhotoUpload, startVideoUpload } from "@repo/lib/photos/actions";
import { saveOrderUpload, startOrderUpload } from "@repo/lib/product-requests/actions";
import { confirmItemUpload, confirmMediaReplace, createUploadSession } from "@repo/lib/storage/actions";
import { MEDIA_BUCKET, PRODUCT_MEDIA_BUCKET } from "@repo/lib/storage/client";
import { confirmProductMediaUpload, createProductMediaUploadSession, type ProductMediaKind } from "@repo/lib/storage/product-media-actions";
import { sendToStorage, UploadRefused, type ResumeState } from "@repo/lib/storage/resumable";
import { confirmVendorSample, startVendorSampleUpload } from "@repo/lib/vendors/actions";
import { SAMPLE_EDGE } from "@repo/lib/vendors/core";

import { putSigned, resizeForUpload } from "../photos/browser";
import { shrinkPicture } from "../photos/shrink-picture";

/** Where an upload goes. Plain data: it's kept on the device with the file. */
export type UploadTarget =
  | { kind: "drive"; via: Via; folderId: string | null }
  | { kind: "order-item"; orderItemId: string }
  | { kind: "order-item-replace"; orderItemId: string; mediaId: string }
  | { kind: "product-media"; productId: string; slot: ProductMediaKind }
  | { kind: "product-request"; slug: string; requestId: string }
  | { kind: "album-photo"; albumId: string }
  | { kind: "album-video"; albumId: string }
  | { kind: "vendor-sample"; offerId: string };

/** What a sender keeps between tries. */
export type Progress = {
  /** A Storage upload pass: the path it's for, its token, when it was given. */
  pass?: { path: string; token: string; at: number } | null;
  /** A piece-by-piece upload under that pass. */
  resume?: ResumeState | null;
  /** The file is in storage; only the server's check is left. */
  landed?: { key: string; contentType?: string } | null;
};

export type SendContext = {
  file: File;
  name: string;
  target: UploadTarget;
  progress: Progress;
  onProgress: (fraction: number) => void;
  keep: (change: Progress) => void;
};

/** Aming said no: trying again won't help. */
export class Refused extends Error {}

/** Kinds whose uploads carry on by themselves on the next visit (the rest wait to be resumed). */
export const RESUMES_BY_ITSELF: UploadTarget["kind"][] = ["order-item", "product-request"];

// A pass lasts 2 hours on the server; one older than this gets a fresh one.
const PASS_FRESH_MS = 100 * 60 * 1000;

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
function must<T>(res: Result<T>): T {
  if (!res.ok) throw new Refused(res.error);
  return res.data as T;
}

/** Storage uploads: a pass from the server, the file (in pieces if big), the server's check. */
async function viaStorage(ctx: SendContext, bucket: string, start: () => Promise<{ path: string; token: string }>, confirm: (path: string) => Promise<Result>) {
  const { file, progress, keep } = ctx;
  let pass = progress.pass && Date.now() - progress.pass.at < PASS_FRESH_MS ? progress.pass : null;
  if (!progress.landed) {
    if (!pass) {
      pass = { ...(await start()), at: Date.now() };
      keep({ pass, resume: null });
    }
    try {
      await sendToStorage(bucket, pass.path, pass.token, file, {
        onProgress: ctx.onProgress,
        resume: progress.pass === pass ? progress.resume : null,
        onResume: (resume) => keep({ resume }),
      });
    } catch (err) {
      if (err instanceof UploadRefused) throw new Refused(err.message);
      throw err;
    }
    keep({ landed: { key: pass.path } });
  }
  must(await confirm(progress.landed?.key ?? pass!.path));
}

/** Photos are made smaller in the browser first, then go in two sizes. */
async function albumPhoto(ctx: SendContext, albumId: string) {
  let r: Awaited<ReturnType<typeof resizeForUpload>>;
  try {
    r = await resizeForUpload(ctx.file);
  } catch {
    throw new Refused("Not a photo this browser can open.");
  }
  const [ticket] = must(await startPhotoUpload({ albumId, files: [{ largeBytes: r.large.size, thumbBytes: r.thumb.size }] }));
  let large = 0;
  let thumb = 0;
  const total = r.large.size + r.thumb.size;
  const report = () => ctx.onProgress((large * r.large.size + thumb * r.thumb.size) / total);
  await Promise.all([putSigned(ticket.largeUrl, r.large, (f) => ((large = f), report())), putSigned(ticket.thumbUrl, r.thumb, (f) => ((thumb = f), report()))]);
  must(await confirmPhotoUpload({ albumId, photoId: ticket.photoId, width: r.width, height: r.height, caption: "" }));
}

export async function send(ctx: SendContext): Promise<void> {
  const { target, file, name, progress, keep } = ctx;
  switch (target.kind) {
    case "drive": {
      // Straight to the Drive's storage (R2) with a signed link; once it's
      // landed, a retry only confirms it: no second upload.
      let landed = progress.landed;
      if (!landed) {
        const [ticket] = must(await startFileUpload(target.via, { folderId: target.folderId, files: [{ name, bytes: file.size, contentType: file.type }] }));
        await putSigned(ticket.url, file, ctx.onProgress, ticket.contentType);
        landed = { key: ticket.fileId, contentType: ticket.contentType };
        keep({ landed });
      }
      must(await confirmFileUpload(target.via, { folderId: target.folderId, fileId: landed.key, name, contentType: landed.contentType }));
      return;
    }
    case "order-item":
      return viaStorage(
        ctx,
        MEDIA_BUCKET,
        async () => {
          const s = await createUploadSession(target.orderItemId, name);
          if (!s.ok) throw new Refused(s.error);
          return s;
        },
        (path) => confirmItemUpload(target.orderItemId, path),
      );
    case "order-item-replace":
      return viaStorage(
        ctx,
        MEDIA_BUCKET,
        async () => {
          const s = await createUploadSession(target.orderItemId, name);
          if (!s.ok) throw new Refused(s.error);
          return s;
        },
        (path) => confirmMediaReplace(target.mediaId, path),
      );
    case "product-media":
      return viaStorage(
        ctx,
        PRODUCT_MEDIA_BUCKET,
        async () => {
          const s = await createProductMediaUploadSession(target.productId, target.slot, name);
          if (!s.ok) throw new Refused(s.error);
          return s;
        },
        (path) => confirmProductMediaUpload(target.productId, target.slot, path),
      );
    case "product-request":
      return viaStorage(
        ctx,
        MEDIA_BUCKET,
        async () => must(await startOrderUpload(target.slug, { requestId: target.requestId, fileName: name, fileType: file.type })),
        (path) => saveOrderUpload(target.slug, { requestId: target.requestId, path }),
      );
    case "album-photo":
      return albumPhoto(ctx, target.albumId);
    case "album-video": {
      const ticket = must(await startVideoUpload({ albumId: target.albumId, bytes: file.size, contentType: file.type }));
      await putSigned(ticket.url, file, ctx.onProgress, file.type);
      must(await confirmVideoUpload({ albumId: target.albumId, videoId: ticket.videoId, contentType: file.type }));
      return;
    }
    case "vendor-sample": {
      let blob: Blob;
      try {
        blob = await shrinkPicture(file, SAMPLE_EDGE);
      } catch (err) {
        throw new Refused(err instanceof Error ? err.message : "Not a picture this browser can open.");
      }
      const ticket = must(await startVendorSampleUpload(target.offerId));
      await putSigned(ticket.url, blob, ctx.onProgress);
      must(await confirmVendorSample(target.offerId, ticket.key));
      return;
    }
  }
}
