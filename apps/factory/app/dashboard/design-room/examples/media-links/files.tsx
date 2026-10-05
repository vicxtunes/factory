"use client";

import { MediaLinks } from "@repo/ui/media/MediaLinks";

import { ORDER_MEDIA } from "../_data/media";

// Photos open in a viewer, the PDF downloads, the Drive link opens in a new tab.
// "Download all" asks the server for a zip, so here it shows its error state.
export default function MediaLinksFiles() {
  return <MediaLinks media={ORDER_MEDIA} />;
}
