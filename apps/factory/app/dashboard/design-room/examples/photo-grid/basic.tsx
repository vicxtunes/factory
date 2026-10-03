"use client";

import { useState } from "react";

import { Lightbox } from "@repo/ui/Lightbox";
import { PhotoGrid } from "@repo/ui/PhotoGrid";

import { PHOTOS } from "../_data/photos";

// Click a photo to open it in the Lightbox.
export default function PhotoGridBasic() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <PhotoGrid photos={PHOTOS} onOpen={setOpen} />
      <Lightbox photos={PHOTOS} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />
    </>
  );
}
