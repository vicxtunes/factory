import { PhotoUploader } from "@repo/ui/photos/PhotoUploader";

import { LookOnly } from "../_data/look-only";

// Top of a studio album: photos are shrunk in the browser, then uploaded three at a time.
export default function PhotoUploaderAlbum() {
  return (
    <div className="max-w-xl">
      <LookOnly>
        <PhotoUploader albumId="design-room-album" />
      </LookOnly>
    </div>
  );
}
