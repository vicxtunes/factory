"use client";

import { MediaLinks } from "@repo/ui/media/MediaLinks";

import { ORDER_MEDIA_PRINTING } from "../_data/media";

// What the factory, graphics and dashboard screens show: photos nobody has
// downloaded stay blurred behind a download button; downloaded ones show
// clear, with who and when. Opening a photo never counts as downloading.
// (These sample files aren't in the database, so downloading one here won't
// change its mark.)
export default function MediaLinksPrinting() {
  return <MediaLinks media={ORDER_MEDIA_PRINTING} trackDownloads editable />;
}
