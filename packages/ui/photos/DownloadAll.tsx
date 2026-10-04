"use client";

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import type { PhotoView } from "@repo/lib/photos/core";

/** Photos per zip file: a whole wedding is too big for one file on a phone. */
const PART = 50;

/**
 * Downloads every photo, zipped in the browser in parts of 50 (no server
 * involved, nothing recompressed: JPEGs are stored as they are).
 */
export function DownloadAll({ photos, name }: { photos: PhotoView[]; name: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parts = Math.ceil(photos.length / PART);

  async function download(part: number) {
    setBusy(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const slice = photos.slice(part * PART, part * PART + PART);
      for (const [i, p] of slice.entries()) {
        setStatus(`Fetching ${i + 1} of ${slice.length}…`);
        const res = await fetch(p.largeUrl);
        if (!res.ok) throw new Error(`Couldn't fetch photo ${part * PART + i + 1}.`);
        zip.file(`photo-${String(part * PART + i + 1).padStart(4, "0")}.jpg`, await res.blob());
      }
      setStatus("Making the zip…");
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^\w.-]+/g, "-")}${parts > 1 ? `-part-${part + 1}` : ""}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  if (photos.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: parts }, (_, part) => (
          <Button key={part} type="button" variant={part === 0 ? "primary" : "secondary"} onClick={() => download(part)} disabled={busy}>
            {parts === 1 ? `Download all (${photos.length})` : `Download part ${part + 1} (${Math.min(PART, photos.length - part * PART)})`}
          </Button>
        ))}
      </div>
      {status ? <p className="text-xs text-muted">{status}</p> : null}
    </div>
  );
}
