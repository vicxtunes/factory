"use client";

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { saveAsZips } from "@repo/ui/files/zip";
import type { PhotoView } from "@repo/lib/photos/core";

/**
 * One button downloads every photo, zipped in the browser (no server involved,
 * nothing recompressed). A big gallery comes as several zips, one after
 * another, so a phone isn't asked to hold a whole wedding at once.
 */
export function DownloadAll({ photos, name }: { photos: PhotoView[]; name: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const items = photos.map((p, i) => ({ path: `photo-${String(i + 1).padStart(4, "0")}.jpg`, url: p.largeUrl, bytes: p.bytes }));
      await saveAsZips(items, name, setStatus);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  if (photos.length === 0) return null;
  return (
    <div className="space-y-1">
      <Button type="button" variant="primary" onClick={download} disabled={busy}>
        {`Download all (${photos.length})`}
      </Button>
      {status ? <p className="text-xs text-muted">{status}</p> : null}
    </div>
  );
}
