"use client";

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Lightbox } from "@repo/ui/Lightbox";

import { PHOTOS } from "../_data/photos";

// ← / → or swipe to browse, thumbnails to jump, Escape to close.
export default function LightboxBasic() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <Button onClick={() => setOpen(0)}>Open viewer</Button>
      <Lightbox photos={PHOTOS} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />
    </>
  );
}
