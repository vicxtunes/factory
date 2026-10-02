"use client";

import { useRef, useState, type CSSProperties, type PointerEvent, type MouseEvent } from "react";

// Horizontal finger-swipe for carousels — an addition to the prev/next
// buttons, never a replacement. Touch/pen only: mouse users keep the buttons
// (and click-drag on an image shouldn't step it). `touch-action: pan-y` hands
// vertical scrolling back to the browser and leaves horizontal movement to
// us, so the page still scrolls normally.
//
// A swipe that ends on the same element it began on would otherwise also
// fire a click (e.g. a lightbox backdrop's "tap to close"), so the click that
// follows a completed swipe is swallowed.
const THRESHOLD_PX = 48; // how far a horizontal drag must travel to count
const MAX_DRIFT = 120; // cap on the follow-the-finger offset

export function useSwipe(onSwipe: (direction: 1 | -1) => void, enabled = true) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  function reset() {
    start.current = null;
    setOffset(0);
    setDragging(false);
  }

  const bind = enabled
    ? {
        style: { touchAction: "pan-y" } as CSSProperties,
        onPointerDown(e: PointerEvent) {
          if (e.pointerType === "mouse" || !e.isPrimary) return;
          swiped.current = false;
          start.current = { x: e.clientX, y: e.clientY };
        },
        onPointerMove(e: PointerEvent) {
          if (!start.current) return;
          const dx = e.clientX - start.current.x;
          const dy = e.clientY - start.current.y;
          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
            setDragging(true);
            setOffset(Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, dx)));
          }
        },
        onPointerUp(e: PointerEvent) {
          if (!start.current) return;
          const dx = e.clientX - start.current.x;
          const dy = e.clientY - start.current.y;
          reset();
          if (Math.abs(dx) >= THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
            swiped.current = true;
            onSwipe(dx < 0 ? 1 : -1); // finger moves left → next photo
          }
        },
        onPointerCancel: reset,
        onClickCapture(e: MouseEvent) {
          if (swiped.current) {
            swiped.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        },
      }
    : {};

  return { bind, offset, dragging };
}
