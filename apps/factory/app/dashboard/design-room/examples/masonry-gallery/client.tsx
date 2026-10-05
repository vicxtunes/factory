import { MasonryGallery } from "@repo/ui/photos/MasonryGallery";

import { albumPhotos } from "../_data/media";

// A client's gallery: tap a photo for the full-screen viewer.
export default function MasonryGalleryClient() {
  return <MasonryGallery photos={albumPhotos(12)} />;
}
