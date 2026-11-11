"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { BottomSheet } from "@repo/ui/BottomSheet";
import { Field, TextInput } from "@repo/ui/Field";
import { UploadRow } from "@repo/ui/UploadRow";
import { UploadThumbs, uploadKey, type UploadThumb } from "@repo/ui/UploadThumbs";
import { addOrderLink } from "@repo/lib/product-requests/actions";
import { orderLinkSchema } from "@repo/lib/product-requests/core";
import { startUploads, useTransfers, whenUploaded } from "@repo/ui/transfers/store";

/**
 * What a client sends to make their order from: photos and PDFs picked on
 * their phone, as they are (never shrunk: they get printed), or a link for a
 * big set. Picked first; sent to storage once the order exists, like a factory
 * order's, through the background uploads (packages/ui/transfers): they keep
 * going if the client moves on, and are kept on the phone until they're in.
 * Files already in stay in, so trying again only sends the rest.
 */
export function useOrderPhotos(slug: string) {
  const [picked, setPicked] = useState<UploadThumb[]>([]);
  const [link, setLink] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // While files go, the list stays as it is.
  const [sending, setSending] = useState(false);
  // Picked file → its upload, once sent.
  const [jobOf, setJobOf] = useState<Record<string, string>>({});
  const jobs = useTransfers((s) => s.uploads);

  const items: UploadThumb[] = picked.map((p) => {
    const job = jobs.find((j) => j.id === jobOf[p.key]);
    if (!job) return p;
    return { ...p, state: job.state === "done" ? "done" : job.state === "failed" || job.state === "paused" ? "failed" : "uploading", progress: job.progress, error: job.note };
  });
  const typedLink = link.trim();
  const linkOk = !typedLink || orderLinkSchema.safeParse(typedLink).success;
  const done = items.filter((i) => i.state === "done").length + (linkSent ? 1 : 0);

  /** Sends what isn't in yet and waits for it. True when everything picked is in. */
  async function send(requestId: string): Promise<boolean> {
    setError(null);
    setSending(true);
    let failed = false;
    const todo = items.filter((i) => i.state !== "done");
    const ids = startUploads(todo.map((i) => ({ file: i.file, where: "Your order", target: { kind: "product-request", slug, requestId } })));
    setJobOf((m) => ({ ...m, ...Object.fromEntries(todo.map((i, k) => [i.key, ids[k]])) }));
    const result = await whenUploaded(ids);
    if (result.failed) {
      failed = true;
      const notes = useTransfers.getState().uploads.filter((u) => ids.includes(u.id) && u.state !== "done").map((u) => u.note);
      setError(notes.find(Boolean) ?? "Some photos didn't upload.");
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
      setPicked([]);
      setJobOf({});
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
            const known = new Set(picked.map((i) => i.key));
            const added = Array.from(files)
              .filter((file) => !known.has(uploadKey(file)))
              .map((file): UploadThumb => ({ key: uploadKey(file), file, state: "selected" }));
            setPicked([...picked, ...added]);
          }}
        />
        <UploadThumbs items={items} onRemove={sending ? undefined : (key) => setPicked(picked.filter((i) => i.key !== key))} />
        <Field label="Or a link to them" hint={linkOk ? "Drive, Dropbox, etc., for a big set" : "Paste the full link, starting with https://"}>
          <TextInput inputMode="url" value={link} disabled={linkSent || sending} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </Field>
      </div>
    ),
  };
}

/** On a client's orders: add photos to one, when they left or want to add to them. */
export function AddOrderPhotos({ slug, requestId, missing }: { slug: string; requestId: string; missing: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const photos = useOrderPhotos(slug);

  // The sheet closes at once: the photos carry on in the background (the
  // uploads panel shows them) and the order updates as they land. One that
  // fails is there to try again.
  function send() {
    setOpen(false);
    void photos.send(requestId).then((ok) => {
      if (ok) photos.reset();
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant={missing ? "primary" : "secondary"} className="min-h-9 text-xs" onClick={() => setOpen(true)}>
        {missing ? "Add photos" : "Add more photos"}
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Add your photos">
        <div className="space-y-3">
          {photos.fields}
          {photos.error ? <p className="text-sm text-error-600 dark:text-error-400">{photos.error}</p> : null}
          <Button type="button" className="w-full" disabled={!photos.ready} onClick={send}>
            Send
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
