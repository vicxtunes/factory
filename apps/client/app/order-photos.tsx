"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { BottomSheet } from "@repo/ui/BottomSheet";
import { Field, TextInput } from "@repo/ui/Field";
import { UploadRow } from "@repo/ui/UploadRow";
import { UploadThumbs, uploadKey, type UploadThumb } from "@repo/ui/UploadThumbs";
import { addOrderLink, saveOrderUpload, startOrderUpload } from "@repo/lib/product-requests/actions";
import { orderLinkSchema } from "@repo/lib/product-requests/core";
import { MEDIA_BUCKET } from "@repo/lib/storage/client";
import { putToSignedUrl } from "@repo/lib/storage/xhr-upload";

/**
 * What a client sends to make their order from: photos and PDFs picked on
 * their phone, as they are (never shrunk: they get printed), or a link for a
 * big set. Picked first; sent to storage once the order exists, like a factory
 * order's. Files already in stay in, so trying again only sends the rest.
 */
export function useOrderPhotos(slug: string) {
  const [items, setItems] = useState<UploadThumb[]>([]);
  const [link, setLink] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // While files go, the list stays as it is.
  const [sending, setSending] = useState(false);

  const patch = (key: string, change: Partial<UploadThumb>) => setItems((all) => all.map((i) => (i.key === key ? { ...i, ...change } : i)));
  const typedLink = link.trim();
  const linkOk = !typedLink || orderLinkSchema.safeParse(typedLink).success;
  const done = items.filter((i) => i.state === "done").length + (linkSent ? 1 : 0);

  /** Sends what isn't in yet. True when everything picked is in. */
  async function send(requestId: string): Promise<boolean> {
    setError(null);
    setSending(true);
    let failed = false;
    for (const item of items) {
      if (item.state === "done") continue;
      patch(item.key, { state: "uploading", progress: 0, error: undefined });
      const problem = await sendFile(slug, requestId, item.file, (progress) => patch(item.key, { progress }));
      patch(item.key, problem ? { state: "failed", error: problem } : { state: "done" });
      if (problem) {
        failed = true;
        setError(problem);
      }
    }
    if (typedLink && !linkSent) {
      const res = await addOrderLink(slug, { requestId, url: typedLink });
      if (res.ok) setLinkSent(true);
      else {
        failed = true;
        setError(res.error);
      }
    }
    setSending(false);
    return !failed;
  }

  return {
    /** Something is picked or typed, and the link (if any) is a real one. */
    ready: (items.length > 0 || !!typedLink) && linkOk,
    /** How many are in. */
    done,
    error,
    send,
    reset() {
      setItems([]);
      setLink("");
      setLinkSent(false);
      setError(null);
    },
    fields: (
      <div className="space-y-3">
        <UploadRow
          label="Add photos"
          hint="Photos or PDFs, the ones to use for your order"
          accept="image/*,application/pdf"
          multiple
          disabled={sending}
          onFiles={(files) => {
            const known = new Set(items.map((i) => i.key));
            const added = Array.from(files)
              .filter((file) => !known.has(uploadKey(file)))
              .map((file): UploadThumb => ({ key: uploadKey(file), file, state: "selected" }));
            setItems([...items, ...added]);
          }}
        />
        <UploadThumbs items={items} onRemove={sending ? undefined : (key) => setItems(items.filter((i) => i.key !== key))} />
        <Field label="Or a link to them" hint={linkOk ? "Drive, Dropbox, etc., for a big set" : "Paste the full link, starting with https://"}>
          <TextInput inputMode="url" value={link} disabled={linkSent || sending} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </Field>
      </div>
    ),
  };
}

/** One file, straight to storage and saved on the order. The problem, if any. */
async function sendFile(slug: string, requestId: string, file: File, onProgress: (fraction: number) => void): Promise<string | null> {
  const started = await startOrderUpload(slug, { requestId, fileName: file.name, fileType: file.type });
  if (!started.ok) return started.error;
  const put = await putToSignedUrl(MEDIA_BUCKET, started.data.path, started.data.token, file, onProgress);
  if (!put.ok) return put.error;
  const saved = await saveOrderUpload(slug, { requestId, path: started.data.path });
  return saved.ok ? null : saved.error;
}

/** On a client's orders: add photos to one, when they left or want to add to them. */
export function AddOrderPhotos({ slug, requestId, missing }: { slug: string; requestId: string; missing: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const photos = useOrderPhotos(slug);

  async function send() {
    setSending(true);
    const ok = await photos.send(requestId);
    setSending(false);
    if (!ok) return;
    photos.reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant={missing ? "primary" : "secondary"} className="min-h-9 text-xs" onClick={() => setOpen(true)}>
        {missing ? "Add photos" : "Add more photos"}
      </Button>
      <BottomSheet open={open} onClose={() => !sending && setOpen(false)} title="Add your photos">
        <div className="space-y-3">
          {photos.fields}
          {photos.error ? <p className="text-sm text-error-600 dark:text-error-400">{photos.error}</p> : null}
          <Button type="button" className="w-full" loading={sending} disabled={!photos.ready} onClick={send}>
            Send
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
