import { DownloadAll } from "@repo/ui/photos/DownloadAll";

import { albumPhotos } from "../_data/media";

// Over 50 photos the download splits into parts, so a phone can manage each zip.
export default function DownloadAllInParts() {
  return <DownloadAll photos={albumPhotos(120)} name="Big wedding" />;
}
