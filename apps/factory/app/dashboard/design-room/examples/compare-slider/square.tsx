import { CompareSlider } from "@repo/ui/CompareSlider";

import { BEFORE, photo } from "../_data/photos";

export default function CompareSliderSquare() {
  return (
    <div className="max-w-md">
      <CompareSlider before={BEFORE.harbour} after={photo("harbour").src} alt="Harbour boats" aspect="1 / 1" beforeLabel="Scan" afterLabel="Retouched" />
    </div>
  );
}
