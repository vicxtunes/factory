import { DownloadAll } from "@repo/ui/photos/DownloadAll";

import { albumPhotos } from "../_data/media";

// A big gallery: still one button; the zips come one after another.
export default function DownloadAllInParts() {
  return <DownloadAll photos={albumPhotos(120)} name="Big wedding" />;
}
