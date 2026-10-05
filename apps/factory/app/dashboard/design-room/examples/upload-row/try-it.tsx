"use client";

import { useState } from "react";

import { UploadRow } from "@repo/ui/UploadRow";

// Choose or drop files: nothing is sent anywhere, the progress is pretend.
export default function UploadRowTryIt() {
  const [progress, setProgress] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  function fakeUpload(files: FileList) {
    setPicked(`${files.length} file${files.length === 1 ? "" : "s"}: ${[...files].map((f) => f.name).join(", ")}`);
    setProgress(0);
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p == null || p >= 1) {
          clearInterval(timer);
          return null;
        }
        return Math.min(1, p + 0.1);
      });
    }, 250);
  }

  return (
    <div className="max-w-md space-y-2">
      <UploadRow
        label="Add photos"
        hint="Photos or PDFs — or drop them here"
        accept="image/*,application/pdf"
        multiple
        disabled={false}
        progress={progress}
        onFiles={fakeUpload}
      />
      {picked ? <p className="text-xs text-muted">{picked}</p> : null}
    </div>
  );
}
