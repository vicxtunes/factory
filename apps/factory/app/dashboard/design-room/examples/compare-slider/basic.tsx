import { CompareSlider } from "@repo/ui/CompareSlider";

import { BEFORE, photo } from "../_data/photos";

// Drag the handle (or focus it and use ← / →) to compare.
export default function CompareSliderBasic() {
  return (
    <div className="max-w-2xl">
      <CompareSlider before={BEFORE["sunset-lake"]} after={photo("sunset-lake").src} alt="Sunset over the lake" beforeLabel="Original" afterLabel="Colour corrected" />
    </div>
  );
}
