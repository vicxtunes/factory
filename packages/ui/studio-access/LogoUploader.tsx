"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@repo/ui/Button";
import { LOGO_EDGE } from "@repo/lib/studio-access/core";
import { confirmStudioLogo, startStudioLogoUpload } from "@repo/lib/studio-access/actions";

/** The logo, shrunk to 512px on a white background (transparent PNGs stay clean) as a JPEG. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const ratio = Math.min(1, LOGO_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't prepare the picture.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the picture."))), "image/jpeg", 0.9),
    );
  } finally {
    bitmap.close();
  }
}

/** Picks, shrinks and uploads the studio's logo (to the photo bucket), then shows it. */
export function LogoUploader({ logoUrl, onUploaded }: { logoUrl: string | null; onUploaded?: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Choose a picture (JPG or PNG).");
      const blob = await shrink(file);
      const ticket = await startStudioLogoUpload();
      if (!ticket.ok) throw new Error(ticket.error);
      const put = await fetch(ticket.data.url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: blob });
      if (!put.ok) throw new Error("The upload failed. Check the connection and try again.");
      const done = await confirmStudioLogo(ticket.data.key);
      if (!done.ok) throw new Error(done.error);
      router.refresh();
      onUploaded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-border bg-background">
        {logoUrl ? (
          // A short-lived signed link to the private bucket: a plain img.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Studio logo" className="h-full w-full object-contain" />
        ) : (
          <span className="px-2 text-center text-xs text-muted">No logo yet</span>
        )}
      </div>
      <div className="space-y-2">
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button type="button" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
          {logoUrl ? "Change logo" : "Upload logo"}
        </Button>
        <p className="text-xs text-muted">A square picture works best. JPG or PNG.</p>
        {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      </div>
    </div>
  );
}
