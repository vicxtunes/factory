"use client";

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Lightbox } from "@repo/ui/Lightbox";
import { PhotoGrid } from "@repo/ui/PhotoGrid";
import { ProgressBar } from "@repo/ui/ProgressBar";

import { PHOTOS } from "../_data/photos";

const MAX = 5;

// Picking photos for an album: tap to pick (numbered in pick order), ⤢ to
// view large — and pick from the viewer too. Stops at MAX.
export default function PhotoGridPick() {
  const [selected, setSelected] = useState<string[]>(["meadow", "harbour"]);
  const [open, setOpen] = useState<number | null>(null);
  const selection = {
    selected,
    max: MAX,
    onToggle: (key: string) => setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key])),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-48 flex-1">
          <p className="mb-1 text-sm font-medium">
            {selected.length} of {MAX} photos picked
          </p>
          <ProgressBar value={selected.length} max={MAX} label="Photos picked" className="max-w-xs" />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="text-xs" disabled={selected.length === 0} onClick={() => setSelected([])}>
            Clear
          </Button>
          <Button className="text-xs" disabled={selected.length !== MAX}>
            Send for printing
          </Button>
        </div>
      </div>
      <PhotoGrid photos={PHOTOS} onOpen={setOpen} selection={selection} />
      <Lightbox photos={PHOTOS} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} selection={selection} />
    </div>
  );
}
