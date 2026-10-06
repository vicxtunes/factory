"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

import type { AlbumView } from "@repo/lib/photos/core";

// The same 3D walk-through as Aming's showroom (@repo/ui/showroom/ShowroomScene.tsx), over a
// studio's albums: each album's cover in turn; scroll or swipe to walk on.
const ShowroomScene = dynamic(() => import("@repo/ui/showroom/ShowroomScene").then((m) => m.ShowroomScene), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">Loading…</div>,
});

export function StudioShowroom({ albums, slug }: { albums: AlbumView[]; slug: string }) {
  const shown = albums.filter((a) => a.coverLargeUrl);
  const [index, setIndex] = useState(0);
  if (shown.length === 0) return null;
  const current = shown[index % shown.length];
  const next = shown[(index + 1) % shown.length];

  return (
    <section className="relative h-[60vh] min-h-80 overflow-hidden rounded-2xl bg-gradient-to-b from-gray-900 to-black">
      <ShowroomScene
        onAdvance={(d) => setIndex((i) => (i + d + shown.length) % shown.length)}
        currentImage={current.coverLargeUrl!}
        nextImage={next.coverLargeUrl!}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
        <div>
          <p className="text-lg font-semibold">{current.title}</p>
          <p className="text-xs opacity-75">
            {current.photoCount} photo{current.photoCount === 1 ? "" : "s"}
            {shown.length > 1 ? " · scroll or swipe for more" : ""}
          </p>
        </div>
        <Link href={`/${slug}/gallery/${current.slug}`} className="pointer-events-auto rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90">
          View album
        </Link>
      </div>
    </section>
  );
}
