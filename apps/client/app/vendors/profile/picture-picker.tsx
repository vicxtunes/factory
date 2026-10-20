"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { confirmVendorPicture, startVendorPictureUpload } from "@repo/lib/vendors/actions";
import { PICTURE_EDGE, type VendorPicture } from "@repo/lib/vendors/core";

import { shrinkPicture } from "../shrink-picture";

/** The cover with the profile photo over its edge, as on the profile; each has its own "change" button. */
export function PicturePicker({ photoUrl, coverUrl, initials }: { photoUrl: string | null; coverUrl: string | null; initials: string }) {
  const router = useRouter();
  const inputs = { photo: useRef<HTMLInputElement>(null), cover: useRef<HTMLInputElement>(null) };
  const [busy, setBusy] = useState<VendorPicture | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(which: VendorPicture, file: File) {
    setError(null);
    setBusy(which);
    try {
      const blob = await shrinkPicture(file, PICTURE_EDGE[which], which === "photo");
      const ticket = await startVendorPictureUpload(which);
      if (!ticket.ok) throw new Error(ticket.error);
      const put = await fetch(ticket.data.url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: blob });
      if (!put.ok) throw new Error("The upload failed. Check the connection and try again.");
      const done = await confirmVendorPicture(which, ticket.data.key);
      if (!done.ok) throw new Error(done.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed.");
    } finally {
      setBusy(null);
      const input = inputs[which].current;
      if (input) input.value = "";
    }
  }

  const camera = (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8a1 1 0 0 1 1-1h3l1.5-2h5L16 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8Zm8 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
    </svg>
  );

  return (
    <div>
      {(["photo", "cover"] as const).map((which) => (
        <input key={which} ref={inputs[which]} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(which, e.target.files[0])} />
      ))}
      <div className="relative h-36 overflow-hidden rounded-2xl bg-gray-950 sm:h-44">
        {coverUrl ? (
          // A short-lived signed link to the private bucket: a plain img.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="absolute -right-16 -bottom-24 h-64 w-[34rem] rotate-[-14deg] rounded-[100%] bg-gradient-to-r from-transparent via-brand-500/80 to-brand-300/60 blur-2xl" />
        )}
        <button
          type="button"
          onClick={() => inputs.cover.current?.click()}
          disabled={busy !== null}
          className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-black/70 disabled:opacity-60"
        >
          {camera}
          {busy === "cover" ? "Uploading…" : coverUrl ? "Change cover" : "Add cover"}
        </button>
      </div>
      <div className="relative z-10 -mt-12 ml-4 inline-block">
        <div className="size-24 overflow-hidden rounded-full bg-brand-500 ring-4 ring-background">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-2xl font-semibold text-white">{initials}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => inputs.photo.current?.click()}
          disabled={busy !== null}
          aria-label={photoUrl ? "Change profile photo" : "Add profile photo"}
          className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full border-2 border-background bg-foreground text-background hover:opacity-90 disabled:opacity-60"
        >
          {busy === "photo" ? <span className="size-3 animate-spin rounded-full border-2 border-background border-t-transparent" /> : camera}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-error-600 dark:text-error-400">{error}</p> : null}
    </div>
  );
}
