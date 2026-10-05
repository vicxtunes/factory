"use client";

import { useState } from "react";

import { UploadRow } from "@repo/ui/UploadRow";
import { UploadThumbs, uploadKey, type UploadThumb } from "@repo/ui/UploadThumbs";

// Pick or drop files: each shows at once, then a pretend upload runs (nothing
// is sent). Every third file "fails" so you can try Retry.
export default function UploadThumbsTryIt() {
  const [items, setItems] = useState<UploadThumb[]>([]);

  const update = (key: string, patch: Partial<UploadThumb>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  function fakeUpload(key: string, fail: boolean) {
    update(key, { state: "uploading", progress: 0 });
    let progress = 0;
    const timer = setInterval(() => {
      progress = Math.min(1, progress + 0.08 + Math.random() * 0.1);
      if (fail && progress > 0.6) {
        clearInterval(timer);
        update(key, { state: "failed", error: "Connection lost." });
      } else if (progress >= 1) {
        clearInterval(timer);
        update(key, { state: "done", progress: 1 });
      } else {
        update(key, { progress });
      }
    }, 200);
  }

  function onFiles(files: FileList) {
    const added = [...files].map((file) => ({ key: `${uploadKey(file)}-${Date.now()}`, file, state: "uploading" as const, progress: 0 }));
    setItems((prev) => [...prev, ...added]);
    added.forEach(({ key }, i) => setTimeout(() => fakeUpload(key, (items.length + i) % 3 === 2), 50));
  }

  return (
    <div className="max-w-md space-y-2">
      <UploadRow label="Add photos" hint="Photos or PDFs — or drop them here" accept="image/*,application/pdf" multiple disabled={false} onFiles={onFiles} />
      <UploadThumbs items={items} onRetry={(key) => fakeUpload(key, false)} />
    </div>
  );
}
