"use client";

import { useRef, useState, type PointerEvent } from "react";

// A 3×3 unlock pattern drawn with a finger or the mouse: dots 0–8, left to
// right, top to bottom, each joined at most once. Hands the dots over when
// the finger lifts.

const DOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const SIZE = 240;
const CELL = SIZE / 3;
const HIT = CELL * 0.32;

const center = (dot: number) => ({ x: (dot % 3) * CELL + CELL / 2, y: Math.floor(dot / 3) * CELL + CELL / 2 });

export function PatternPad({ onDone, disabled }: { onDone: (pattern: number[]) => void; disabled?: boolean }) {
  const [path, setPath] = useState<number[]>([]);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const drawing = useRef(false);

  function at(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * SIZE, y: ((e.clientY - rect.top) / rect.height) * SIZE };
  }

  function touch(p: { x: number; y: number }, current: number[]) {
    const hit = DOTS.find((d) => !current.includes(d) && Math.hypot(center(d).x - p.x, center(d).y - p.y) < HIT);
    return hit === undefined ? current : [...current, hit];
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    setPointer(null);
    if (path.length) onDone(path);
    setPath([]);
  }

  const points = path.map(center);
  return (
    <div
      role="application"
      aria-label="Draw your unlock pattern"
      className={`relative mx-auto aspect-square w-full max-w-60 touch-none select-none ${disabled ? "pointer-events-none opacity-50" : ""}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = true;
        const p = at(e);
        setPointer(p);
        setPath(touch(p, []));
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const p = at(e);
        setPointer(p);
        setPath((current) => touch(p, current));
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full text-foreground">
        {points.length ? (
          <polyline
            points={[...points, ...(pointer ? [pointer] : [])].map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.35}
          />
        ) : null}
        {DOTS.map((d) => {
          const c = center(d);
          const on = path.includes(d);
          return (
            <g key={d}>
              {on ? <circle cx={c.x} cy={c.y} r={18} fill="currentColor" opacity={0.12} /> : null}
              <circle cx={c.x} cy={c.y} r={on ? 7 : 5} fill="currentColor" opacity={on ? 1 : 0.45} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
