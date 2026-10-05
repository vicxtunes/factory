"use client";

import { UploadRow } from "@repo/ui/UploadRow";

const noop = () => {};

export default function UploadRowStates() {
  return (
    <div className="grid max-w-md gap-3">
      <UploadRow label="Ready" hint="Photos or PDFs — or drop them here" accept="image/*" disabled={false} onFiles={noop} />
      <UploadRow label="Uploading" hint="" accept="image/*" disabled={false} progress={0.42} onFiles={noop} />
      <UploadRow label="Disabled" hint="Save the product first" accept="image/*" disabled onFiles={noop} />
    </div>
  );
}
