"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { orderItemDrive } from "@repo/lib/files/actions";
import { DownloadIcon } from "@repo/ui/media/icons";

import { FolderArt } from "./FolderArt";

type Attached = { studioName: string; folders: { id: string; name: string }[]; files: { id: string; name: string; url: string }[] };

// On an Aming order item, for staff: what the studio attached from its Drive
// when it ordered (linked, not copied). Folders open on their own page,
// where staff look, download and add; files download straight. Nothing shows
// when nothing is attached.
export function OrderItemDrive({ itemId }: { itemId: string }) {
  const [attached, setAttached] = useState<Attached | null>(null);

  useEffect(() => {
    let cancelled = false;
    orderItemDrive(itemId).then((res) => {
      if (!cancelled) setAttached(res.ok ? res.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  if (!attached || (!attached.folders.length && !attached.files.length)) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted">From {attached.studioName}&apos;s Drive (kept until the order is done)</p>
      <ul className="space-y-1">
        {attached.folders.map((f) => (
          <li key={f.id}>
            <Link
              href={`/dashboard/orders/items/${itemId}/drive?folder=${f.id}`}
              className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm hover:bg-background"
            >
              <FolderArt className="h-5 w-6 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
              <span className="text-xs text-brand-600">Open</span>
            </Link>
          </li>
        ))}
        {attached.files.map((f) => (
          <li key={f.id}>
            <a href={f.url} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm hover:bg-background">
              <DownloadIcon className="h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
