"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@repo/ui/Button";

// Sign with a finger or mouse. Hands back a PNG of just the signature
// (cropped to the ink, transparent around it), ready to print above the
// invoice's signature line.

const INK = "#111827";

export function SignaturePad({ busy, onDone, onCancel }: { busy: boolean; onDone: (png: Blob) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  /** The ink's extent, in canvas pixels; null while it's empty. */
  const bounds = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Sized to the element at the screen's pixel density, so the strokes are crisp.
  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2.5 * ratio;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current!;
    const rect = c.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * c.width;
    const y = ((e.clientY - rect.top) / rect.height) * c.height;
    const b = bounds.current;
    bounds.current = b
      ? { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) }
      : { x0: x, y0: y, x1: x, y1: y };
    return { x, y };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y); // a tap leaves a dot
    ctx.stroke();
    setEmpty(false);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const { x, y } = point(e);
    const ctx = canvas.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    bounds.current = null;
    setEmpty(true);
  }

  function use() {
    const c = canvas.current!;
    const b = bounds.current;
    if (!b) return;
    const pad = 4 * (window.devicePixelRatio || 1);
    const x = Math.max(0, Math.floor(b.x0 - pad));
    const y = Math.max(0, Math.floor(b.y0 - pad));
    const w = Math.min(c.width, Math.ceil(b.x1 + pad)) - x;
    const h = Math.min(c.height, Math.ceil(b.y1 + pad)) - y;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d")!.drawImage(c, x, y, w, h, 0, 0, w, h);
    out.toBlob((png) => png && onDone(png), "image/png");
  }

  return (
    <div className="space-y-2">
      {/* White in both themes: it's ink on paper. */}
      <canvas
        ref={canvas}
        aria-label="Signature pad: sign here with your finger or mouse"
        className="block h-40 w-full cursor-crosshair touch-none rounded-xl border border-border bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="min-h-9 text-xs" disabled={empty} loading={busy} onClick={use}>
          Use this signature
        </Button>
        <Button type="button" variant="secondary" className="min-h-9 text-xs" disabled={empty || busy} onClick={clear}>
          Clear
        </Button>
        <button type="button" className="text-xs text-muted" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
