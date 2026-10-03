"use client";

import { useState } from "react";

import { AlbumCard } from "@repo/ui/AlbumCard";

import { ALBUMS } from "../_data/photos";

// One of each status. Columns follow the container width, not the viewport.
export default function AlbumCardGrid() {
  const [opened, setOpened] = useState<string>();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(14rem,100%),1fr))] gap-4">
        {ALBUMS.map((a) => (
          <AlbumCard key={a.id} title={a.title} client={a.client} cover={a.cover} count={a.count} status={a.status} onClick={() => setOpened(a.title)} />
        ))}
      </div>
      <p className="text-xs text-muted">{opened ? `Opened “${opened}”` : "Click an album to open it."}</p>
    </div>
  );
}
