"use client";

import { useState } from "react";

import { DeviceFrame } from "@repo/ui/DeviceFrame";
import { Lightbox } from "@repo/ui/Lightbox";
import { PhotoGrid } from "@repo/ui/PhotoGrid";

import { PHOTOS } from "../_data/photos";

// Same grid at phone width — the columns come from the container, so it
// drops to two. The Lightbox fills the phone screen.
export default function PhotoGridMobile() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <DeviceFrame device="mobile" className="mx-auto w-72">
      <h1 className="mb-4 text-xl font-semibold">Wedding — proofs</h1>
      <PhotoGrid photos={PHOTOS} onOpen={setOpen} />
      <Lightbox photos={PHOTOS} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />
    </DeviceFrame>
  );
}
