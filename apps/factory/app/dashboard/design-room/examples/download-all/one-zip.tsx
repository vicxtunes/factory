import { DownloadAll } from "@repo/ui/photos/DownloadAll";

import { albumPhotos } from "../_data/media";

// Works for real: zips the 12 sample photos in the browser.
export default function DownloadAllOneZip() {
  return <DownloadAll photos={albumPhotos(12)} name="Design Room album" />;
}
