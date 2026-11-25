"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import * as Icon from "./icons";
import { PEAKS_PER_SECOND, clipWave, songWave, strip, type Strip } from "./media";
import { starts, totalLength, used, type Clip, type Project, type Source, type TextItem } from "./model";

export type Sel = { kind: "clip"; id: string } | { kind: "text"; id: string } | { kind: "song" } | { kind: "transition"; id: string } | null;

const TILE = 40;
const VIDEO_H = 56;
const LANE_H = 26;

export function useStrip(c: Clip | null | undefined): Strip | null {
  const [s, setS] = useState<{ source: Source; strip: Strip } | null>(null);
  const source = c?.source;
  const type = c?.type;
  const length = c?.length ?? 0;
  useEffect(() => {
    if (!source || !type) return;
    let live = true;
    void strip(source, type, length).then((x) => live && setS({ source, strip: x }));
    return () => {
      live = false;
    };
  }, [source, type, length]);
  return s && s.source === source ? s.strip : null;
}

function useWave(key: Source | File | null | undefined): number[] | null {
  const [w, setW] = useState<{ key: object; wave: number[] } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    void (key instanceof File ? songWave(key) : clipWave(key)).then((x) => live && setW({ key, wave: x }));
    return () => {
      live = false;
    };
  }, [key]);
  return w && w.key === key ? w.wave : null;
}

/** A sound's shape from `from` to `to` seconds of it, `width` pixels wide. */
function Wave({ peaks, from, pps, width, className }: { peaks: number[] | null; from: number; pps: number; width: number; className: string }) {
  const d = useMemo(() => {
    if (!peaks?.length) return "";
    let path = "";
    for (let x = 0; x < width; x += 3) {
      const v = peaks[Math.floor((from + x / pps) * PEAKS_PER_SECOND)] ?? 0;
      const h = Math.max(0.04, v) * 50;
      path += `M${x + 1} ${50 - h}V${50 + h}`;
    }
    return path;
  }, [peaks, from, pps, width]);
  return (
    <svg className={className} viewBox={`0 0 ${Math.max(1, width)} 100`} preserveAspectRatio="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Drag with the pointer: `move` gets how far it went, in pixels. */
function drag(e: ReactPointerEvent, move: (dx: number) => void, end?: () => void) {
  e.stopPropagation();
  e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  const x0 = e.clientX;
  const onMove = (ev: PointerEvent) => move(ev.clientX - x0);
  const onUp = () => {
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    end?.();
  };
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
}

function Handles({ onLeft, onRight, color = "bg-white" }: { onLeft: (e: ReactPointerEvent) => void; onRight: (e: ReactPointerEvent) => void; color?: string }) {
  const grip = <span className="h-1/3 w-0.5 rounded-full bg-gray-900/50" />;
  return (
    <>
      <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-white ring-inset" />
      <button type="button" aria-label="Trim start" onPointerDown={onLeft} className={`absolute -left-3 top-0 flex h-full w-3 cursor-ew-resize touch-none items-center justify-center rounded-l-md ${color}`}>
        {grip}
      </button>
      <button type="button" aria-label="Trim end" onPointerDown={onRight} className={`absolute -right-3 top-0 flex h-full w-3 cursor-ew-resize touch-none items-center justify-center rounded-r-md ${color}`}>
        {grip}
      </button>
    </>
  );
}

function ClipBlock({ c, x, pps, selected, onSelect, onChange }: { c: Clip; x: number; pps: number; selected: boolean; onSelect: () => void; onChange: (patch: Partial<Clip>) => void }) {
  const s = useStrip(c);
  const wave = useWave(c.type === "video" && c.hasSound ? c.source : null);
  const width = Math.max(4, used(c) * pps);
  const tiles = Math.ceil(width / TILE);
  const frameAt = (sec: number) => {
    if (!s?.urls.length) return null;
    const i = Math.min(s.urls.length - 1, Math.max(0, Math.round((sec / Math.max(0.01, c.length)) * s.urls.length - 0.5)));
    return s.urls[i];
  };

  const trim = (side: "in" | "out") => (e: ReactPointerEvent) => {
    const o = { in: c.in, out: c.out };
    drag(e, (dx) => {
      const sec = dx / pps;
      if (c.type === "image") {
        const out = Math.min(30, Math.max(0.5, side === "out" ? o.out + sec : o.out - sec));
        onChange({ out: Math.round(out * 10) / 10, length: Math.round(out * 10) / 10 });
      } else if (side === "in") onChange({ in: Math.min(o.out - 0.3, Math.max(0, o.in + sec)) });
      else onChange({ out: Math.max(o.in + 0.3, Math.min(c.length, o.out + sec)) });
    });
  };

  return (
    <div className="absolute top-0" style={{ left: x, width, height: VIDEO_H }}>
      <button type="button" onClick={onSelect} aria-label={c.name} className="relative block size-full overflow-hidden rounded-md bg-white/10">
        <span className="absolute inset-0 flex">
          {Array.from({ length: tiles }, (_, i) => {
            const url = frameAt(c.in + (i * TILE + TILE / 2) / pps);
            return url ? (
              // eslint-disable-next-line @next/next/no-img-element -- a frame of the clip
              <img key={i} src={url} alt="" draggable={false} className="h-full shrink-0 object-cover" style={{ width: TILE }} />
            ) : (
              <span key={i} className="h-full shrink-0 animate-pulse border-r border-black/20 bg-white/10" style={{ width: TILE }} />
            );
          })}
        </span>
        {c.type === "video" && c.hasSound ? (
          <span className={`absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-black/70 to-transparent ${c.volume === 0 ? "text-white/25" : "text-sky-300"}`}>
            <Wave peaks={wave} from={c.in} pps={pps} width={width} className="size-full" />
          </span>
        ) : null}
        <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/60 px-1 text-[10px] font-semibold tnum">
          {c.volume === 0 && c.type === "video" ? <Icon.Mute className="size-3" /> : null}
          {used(c).toFixed(1)}s
        </span>
      </button>
      {selected ? <Handles onLeft={trim("in")} onRight={trim("out")} /> : null}
    </div>
  );
}

/** Words placed in lanes so bars that overlap in time sit one above another. */
function lanes(texts: TextItem[]): Map<string, number> {
  const ends: number[] = [];
  const out = new Map<string, number>();
  for (const x of [...texts].sort((a, b) => a.start - b.start)) {
    let lane = ends.findIndex((e) => e <= x.start + 0.01);
    if (lane < 0) lane = ends.length;
    ends[lane] = x.end;
    out.set(x.id, lane);
  }
  return out;
}

// The timeline (CapCut-style): the playhead stays in the middle and the tracks
// slide under it. Scrolling moves through the video; while it plays, the
// tracks follow. Clips show their frames and sound; words and the song sit on
// their own tracks. Tap to select, drag the white handles to trim, drag words
// or the song to move them. Ctrl/⌘ + wheel or two fingers zoom.
export function Timeline({
  p,
  t,
  pps,
  onZoom,
  sel,
  onSelect,
  onSeek,
  onClip,
  onText,
  onSong,
  onAddClips,
  onAddText,
  onAddAudio,
  onMuteAll,
}: {
  p: Project;
  t: number;
  pps: number;
  onZoom: (pps: number) => void;
  sel: Sel;
  onSelect: (s: Sel) => void;
  onSeek: (t: number) => void;
  onClip: (id: string, patch: Partial<Clip>) => void;
  onText: (id: string, patch: Partial<TextItem>) => void;
  onSong: (start: number) => void;
  onAddClips: (files: FileList | null) => void;
  onAddText: () => void;
  onAddAudio: () => void;
  onMuteAll: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const expected = useRef(-1);
  const zoomRef = useRef({ pps, onZoom });
  const [half, setHalf] = useState(0);
  const total = totalLength(p);
  const at = starts(p);
  const textLanes = lanes(p.texts);
  const laneCount = Math.max(1, ...[...textLanes.values()].map((l) => l + 1));
  const songWaveData = useWave(p.song?.file);

  useEffect(() => {
    zoomRef.current = { pps, onZoom };
  }, [pps, onZoom]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHalf(Math.round(el.clientWidth / 2)));
    ro.observe(el);
    // Zoom: Ctrl/⌘ + wheel (and a trackpad pinch), or two fingers.
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        // A mouse wheel moves along the timeline.
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
        return;
      }
      e.preventDefault();
      const z = zoomRef.current;
      z.onZoom(Math.min(400, Math.max(6, z.pps * Math.exp(-e.deltaY * 0.01))));
    };
    let pinch: { d: number; pps: number } | null = null;
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const tstart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { d: dist(e), pps: zoomRef.current.pps };
    };
    const tmove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      zoomRef.current.onZoom(Math.min(400, Math.max(6, (pinch.pps * dist(e)) / pinch.d)));
    };
    const tend = () => {
      pinch = null;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", tstart, { passive: true });
    el.addEventListener("touchmove", tmove, { passive: false });
    el.addEventListener("touchend", tend);
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", tstart);
      el.removeEventListener("touchmove", tmove);
      el.removeEventListener("touchend", tend);
    };
  }, []);

  // Keep the tracks under the playhead as time moves.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const want = Math.round(t * pps);
    if (Math.abs(el.scrollLeft - want) > 1) {
      expected.current = want;
      el.scrollLeft = want;
    }
  }, [t, pps, half]);

  const onScroll = () => {
    const el = box.current;
    if (!el || Math.abs(el.scrollLeft - expected.current) <= 1) return;
    expected.current = -1;
    onSeek(Math.min(total, el.scrollLeft / pps));
  };

  // Ruler: a label every so many seconds, far enough apart to read.
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * pps >= 64) ?? 60;
  const marks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const label = (s: number) => (step < 1 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

  const song = p.song;
  const songFrom = song ? Math.max(0, -song.start) : 0;
  const songTo = song ? Math.min(total, song.length - song.start) : 0;
  const width = half * 2 + total * pps;

  return (
    <div className="relative select-none">
      <div ref={box} onScroll={onScroll} className="overflow-x-auto overflow-y-hidden overscroll-x-contain" style={{ scrollbarWidth: "none" }}>
        <div className="relative" style={{ width, height: 24 + 8 + VIDEO_H + 10 + laneCount * LANE_H + 6 + 34 }} onClick={() => onSelect(null)}>
          {/* Ruler */}
          <div className="absolute inset-x-0 top-0 h-6 text-[10px] text-white/40 tnum">
            {marks.map((s) => (
              <span key={s} className="absolute top-1 -translate-x-1/2" style={{ left: half + s * pps }}>
                {label(s)}
              </span>
            ))}
            {marks.map((s) => (
              <span key={`d${s}`} className="absolute top-2.5 size-0.5 rounded-full bg-white/30" style={{ left: half + (s + step / 2) * pps }} />
            ))}
          </div>

          {/* Clips */}
          <div className="absolute inset-x-0" style={{ top: 32, height: VIDEO_H }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={onMuteAll}
              aria-label="Mute all clips"
              className="absolute top-1/2 flex -translate-y-1/2 flex-col items-center gap-0.5 text-[9px] font-semibold text-white/60 hover:text-white"
              style={{ left: half - 52, width: 44 }}
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">{p.clips.every((c) => c.volume === 0 || !c.hasSound) ? <Icon.Mute className="size-4" /> : <Icon.Volume className="size-4" />}</span>
              Sound
            </button>
            {p.clips.map((c, i) => (
              <ClipBlock key={c.id} c={c} x={half + at[i] * pps} pps={pps} selected={sel?.kind === "clip" && sel.id === c.id} onSelect={() => onSelect({ kind: "clip", id: c.id })} onChange={(patch) => onClip(c.id, patch)} />
            ))}
            {p.clips.slice(1).map((c, i) => (
              <button
                key={`tr${c.id}`}
                type="button"
                aria-label="Transition"
                onClick={() => onSelect({ kind: "transition", id: c.id })}
                className={`absolute top-1/2 z-10 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md shadow-md ring-1 ring-black/30 ${
                  sel?.kind === "transition" && sel.id === c.id ? "bg-brand-500 text-white" : c.transition !== "none" ? "bg-white text-brand-600" : "bg-white/90 text-gray-900"
                }`}
                style={{ left: half + at[i + 1] * pps }}
              >
                {c.transition !== "none" ? <Icon.Transition className="size-3.5" /> : <span className="block h-2.5 w-px bg-gray-900" />}
              </button>
            ))}
            <label className="absolute top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg bg-white text-gray-950 shadow" style={{ left: half + total * pps + 14 }} aria-label="Add clips">
              <Icon.Plus className="size-5" />
              <input type="file" accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp,.mp4,.mov,.jpg,.jpeg,.png,.webp" multiple className="sr-only" onChange={(e) => onAddClips(e.target.files)} />
            </label>
          </div>

          {/* Words */}
          <div className="absolute inset-x-0" style={{ top: 32 + VIDEO_H + 10, height: laneCount * LANE_H }} onClick={(e) => e.stopPropagation()}>
            {p.texts.length === 0 ? (
              <button type="button" onClick={onAddText} className="absolute flex h-6 items-center gap-1.5 rounded-md bg-white/10 px-2.5 text-[11px] font-semibold text-white/70 hover:bg-white/15" style={{ left: half }}>
                <Icon.Text className="size-3.5" /> Add text
              </button>
            ) : null}
            {p.texts.map((x) => {
              const selected = sel?.kind === "text" && sel.id === x.id;
              const move = (kind: "body" | "start" | "end") => (e: ReactPointerEvent) => {
                const o = { start: x.start, end: x.end };
                let moved = false;
                if (!selected) onSelect({ kind: "text", id: x.id });
                drag(e, (dx) => {
                  const sec = dx / pps;
                  if (Math.abs(dx) > 3) moved = true;
                  if (kind === "body") {
                    const len = o.end - o.start;
                    const start = Math.min(Math.max(0, total - len), Math.max(0, o.start + sec));
                    onText(x.id, { start, end: start + len });
                  } else if (kind === "start") onText(x.id, { start: Math.min(o.end - 0.3, Math.max(0, o.start + sec)) });
                  else onText(x.id, { end: Math.max(o.start + 0.3, Math.min(total, o.end + sec)) });
                }, () => {
                  if (!moved && kind === "body") onSelect({ kind: "text", id: x.id });
                });
              };
              return (
                <div key={x.id} className="absolute" style={{ left: half + x.start * pps, width: Math.max(8, (x.end - x.start) * pps), top: (textLanes.get(x.id) ?? 0) * LANE_H, height: LANE_H - 4 }}>
                  <div onPointerDown={move("body")} className="flex size-full cursor-grab touch-none items-center gap-1 overflow-hidden rounded-md bg-amber-500 px-1.5 text-[11px] font-semibold text-gray-950">
                    <Icon.Text className="size-3 shrink-0" />
                    <span className="truncate">{x.text.trim() || "Text"}</span>
                  </div>
                  {selected ? <Handles onLeft={move("start")} onRight={move("end")} color="bg-white" /> : null}
                </div>
              );
            })}
          </div>

          {/* Song */}
          <div className="absolute inset-x-0" style={{ top: 32 + VIDEO_H + 10 + laneCount * LANE_H + 6, height: 30 }} onClick={(e) => e.stopPropagation()}>
            {song && songTo > songFrom ? (
              <div className="absolute h-full" style={{ left: half + songFrom * pps, width: (songTo - songFrom) * pps }}>
                <div
                  onPointerDown={(e) => {
                    const o = song.start;
                    let moved = false;
                    drag(
                      e,
                      (dx) => {
                        if (Math.abs(dx) > 3) moved = true;
                        onSong(Math.min(song.length - 1, Math.max(-(total - 1), o - dx / pps)));
                      },
                      () => !moved && onSelect({ kind: "song" }),
                    );
                  }}
                  className={`relative flex size-full cursor-grab touch-none items-center overflow-hidden rounded-md bg-emerald-600/90 text-emerald-100 ${sel?.kind === "song" ? "ring-2 ring-white ring-inset" : ""}`}
                >
                  <Wave peaks={songWaveData} from={songFrom + song.start} pps={pps} width={(songTo - songFrom) * pps} className="absolute inset-0 size-full opacity-70" />
                  <span className="relative ml-1.5 flex max-w-full items-center gap-1 truncate rounded bg-black/40 px-1 text-[10px] font-semibold text-white">
                    <Icon.Music className="size-3 shrink-0" />
                    <span className="truncate">{song.name}</span>
                  </span>
                </div>
              </div>
            ) : (
              <button type="button" onClick={onAddAudio} className="absolute flex h-6 items-center gap-1.5 rounded-md bg-white/10 px-2.5 text-[11px] font-semibold text-white/70 hover:bg-white/15" style={{ left: half }}>
                <Icon.Music className="size-3.5" /> Add music
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Playhead */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(0,0,0,0.6)]">
        <span className="absolute -left-[3px] top-0 size-2 rounded-full bg-white" />
      </div>
    </div>
  );
}
