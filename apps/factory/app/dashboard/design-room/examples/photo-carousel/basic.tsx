import { PhotoCarousel } from "@repo/ui/PhotoCarousel";

import { PHOTOS } from "../_data/photos";

// Mixed landscape, portrait and square photos — none are cropped.
export default function PhotoCarouselBasic() {
  return (
    <div className="max-w-2xl">
      <PhotoCarousel photos={PHOTOS.slice(0, 6)} label="Album preview" />
    </div>
  );
}
