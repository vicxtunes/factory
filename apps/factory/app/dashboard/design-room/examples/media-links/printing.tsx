"use client";

import { MediaLinks } from "@repo/ui/media/MediaLinks";

import { ORDER_MEDIA_PRINTING } from "../_data/media";

// What the factory, graphics and dashboard screens show: a photo nobody has
// downloaded isn't fetched until you press its cloud button; then it can be
// opened, and the corner download saves it. Downloaded ones show a tick
// (hover it to download again) and who and when. (These sample files aren't
// in the database, so saving one here won't change its mark.)
export default function MediaLinksPrinting() {
  return <MediaLinks media={ORDER_MEDIA_PRINTING} trackDownloads editable />;
}
