"use client";

import { MediaLinks } from "@repo/ui/media/MediaLinks";

import { ORDER_MEDIA_PRINTING } from "../_data/media";

// What the factory, graphics and dashboard screens show: pending files ringed
// amber, downloaded ones ticked with who and when. Only pressing Download
// marks a file; opening the preview doesn't. (These sample files aren't in
// the database, so downloading one here won't flip its mark.)
export default function MediaLinksPrinting() {
  return <MediaLinks media={ORDER_MEDIA_PRINTING} trackDownloads />;
}
