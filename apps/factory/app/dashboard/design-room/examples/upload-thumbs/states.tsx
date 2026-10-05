"use client";

import { useEffect, useState } from "react";

import { UploadThumbs, type UploadThumb } from "@repo/ui/UploadThumbs";

const SAMPLES = ["sunset-lake", "ocean-cliffs", "forest-morning", "city-dusk"];

async function sampleFile(key: string): Promise<File> {
  const blob = await (await fetch(`/design-room/photos/${key}.svg`)).blob();
  return new File([blob], `${key}.svg`, { type: "image/svg+xml" });
}

// Picked (✕ to remove, before an order is placed), uploading, done, failed, and a PDF.
export default function UploadThumbsStates() {
  const [picked, setPicked] = useState<UploadThumb[]>([]);
  const [sending, setSending] = useState<UploadThumb[]>([]);

  useEffect(() => {
    Promise.all(SAMPLES.map(sampleFile)).then((files) => {
      const pdf = new File(["%PDF-1.4"], "layout-proof.pdf", { type: "application/pdf" });
      setPicked([...files.slice(0, 3), pdf].map((file) => ({ key: file.name, file, state: "selected" })));
      setSending([
        { key: "a", file: files[0], state: "done", progress: 1 },
        { key: "b", file: files[1], state: "done", progress: 1 },
        { key: "c", file: files[2], state: "uploading", progress: 0.64 },
        { key: "d", file: files[3], state: "failed", error: "Connection lost." },
        { key: "e", file: pdf, state: "uploading", progress: 0.1 },
      ]);
    });
  }, []);

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Picked, not sent yet</p>
        <UploadThumbs items={picked} onRemove={(key) => setPicked((p) => p.filter((i) => i.key !== key))} />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Uploading</p>
        <UploadThumbs items={sending} onRetry={() => {}} />
      </div>
    </div>
  );
}
