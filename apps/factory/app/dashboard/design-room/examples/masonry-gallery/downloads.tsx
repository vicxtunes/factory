import { MasonryGallery } from "@repo/ui/photos/MasonryGallery";

import { albumPhotos } from "../_data/media";

// A delivery: the viewer also offers a download for each photo.
export default function MasonryGalleryDownloads() {
  return <MasonryGallery photos={albumPhotos(12)} downloads />;
}
