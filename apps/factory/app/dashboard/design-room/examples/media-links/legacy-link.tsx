"use client";

import { MediaLinks } from "@repo/ui/media/MediaLinks";

// Old orders from before uploads: just the link that was pasted on the order.
export default function MediaLinksLegacyLink() {
  return (
    <div className="flex flex-wrap gap-6">
      <MediaLinks media={[]} legacyLink="/design-room/photos/harbour.svg" />
      <MediaLinks media={[]} legacyLink="https://www.dropbox.com/sh/example" />
    </div>
  );
}
