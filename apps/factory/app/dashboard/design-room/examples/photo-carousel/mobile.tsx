import { DeviceFrame } from "@repo/ui/DeviceFrame";
import { PhotoCarousel } from "@repo/ui/PhotoCarousel";

import { PHOTOS } from "../_data/photos";

export default function PhotoCarouselMobile() {
  return (
    <DeviceFrame device="mobile" className="mx-auto w-72">
      <h1 className="mb-4 text-xl font-semibold">Your album</h1>
      <PhotoCarousel photos={PHOTOS.slice(4, 10)} label="Album preview" />
    </DeviceFrame>
  );
}
