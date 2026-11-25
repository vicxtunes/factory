"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@repo/ui/Button";
import { ProgressBar } from "@repo/ui/ProgressBar";
import { amingSongs } from "@repo/lib/social/actions";
import type { PostMedia, Song as LibrarySong } from "@repo/lib/social/core";

import { uploadMedia } from "../MediaPicker";
import { ASPECTS, LOOKS, at, frameSize, lookCss, newId, readableUrl, srcUrl, totalLength, used, type Aspect, type Clip, type Corner, type Project, type TextItem, type TextStyle } from "./model";

type Tool = "clips" | "size" | "text" | "look" | "logo" | "sound";

const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const time1 = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const COLORS = ["#FFFFFF", "#FFD400", "#FE2C55", "#25F4EE", "#22C55E", "#000000"];
const MEDIA = "video/mp4,video/quicktime,image/jpeg,image/png,image/webp,.mp4,.mov,.jpg,.jpeg,.png,.webp";
const SOUND = "audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.aac,.wav,video/mp4,video/quicktime,.mp4,.mov";

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
const TOOLS: { key: Tool; label: string; icon: ReactNode }[] = [
  {
    key: "clips",
    label: "Clips",
    icon: (
      <Svg>
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
      </Svg>
    ),
  },
  {
    key: "size",
    label: "Size",
    icon: (
      <Svg>
        <rect x="6" y="2" width="12" height="20" rx="2" />
      </Svg>
    ),
  },
  {
    key: "text",
    label: "Text",
    icon: (
      <Svg>
        <path d="M4 7V5h16v2M12 5v14M9 19h6" />
      </Svg>
    ),
  },
  {
    key: "look",
    label: "Look",
    icon: (
      <Svg>
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      </Svg>
    ),
  },
  {
    key: "logo",
    label: "Logo",
    icon: (
      <Svg>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <rect x="13" y="13" width="5" height="5" rx="1" />
      </Svg>
    ),
  },
  {
    key: "sound",
    label: "Sound",
    icon: (
      <Svg>
        <path d="M9 18V5l11-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="17" cy="16" r="3" />
      </Svg>
    ),
  },
];

/** Plays, mutes and saves, on a phone or a computer. */
function Chip({ on, onClick, children, label }: { on?: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${on ? "bg-brand-500 text-white" : "bg-white/10 text-white hover:bg-white/20"}`}
    >
      {children}
    </button>
  );
}

function Slider({ label, value, min, max, step = 1, onChange, show }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; show: string }) {
  return (
    <label className="flex items-center gap-3 text-xs">
      <span className="w-14 shrink-0 text-white/60">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-brand-500" />
      <span className="w-12 shrink-0 text-right font-semibold tnum">{show}</span>
    </label>
  );
}

/** The words on the preview, styled as the export draws them. */
function textCss(item: TextItem): CSSProperties {
  const base: CSSProperties = { fontSize: `${item.size * 100}cqw`, fontWeight: 800, lineHeight: 1.2, color: item.color };
  if (item.style === "box") return { ...base, background: "rgba(0,0,0,0.62)", padding: "0 0.3em", borderRadius: "0.2em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" };
  if (item.style === "glow") return { ...base, color: "#fff", textShadow: `0 0 0.25em ${item.color}, 0 0 0.5em ${item.color}` };
  return { ...base, textShadow: "0 0 0.06em #000, 0 0 0.06em #000, 0 0 0.06em #000" };
}

// The video editor (owner, 2026-11-25): opened from a post's photos and
// videos, full screen. A live preview on top (the look, words and logo shown
// as they'll come out; drag words to place them), the tools below: clips
// (trim, order, add, remove), size, words, look, logo, sound (each clip's own
// muted or turned down, its sound saved on its own, a song from Aming music or
// any song or video). Done makes the video in the browser (./render.ts) and
// it replaces the post's photos and videos.
export function VideoEditor({ media, onDone, onClose }: { media: PostMedia[]; onDone: (next: PostMedia[]) => void; onClose: () => void }) {
  const [p, setP] = useState<Project | null>(null);
  const [tool, setTool] = useState<Tool>("clips");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selClip, setSelClip] = useState(0);
  const [selText, setSelText] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const songRef = useRef<HTMLAudioElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tRef = useRef(0);
  const pRef = useRef<Project | null>(null);
  useEffect(() => {
    pRef.current = p;
  }, [p]);

  // The post's photos and videos become the first clips.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { probe } = await import("./render");
        const clips = await Promise.all(media.map((m, i) => probe({ kind: "url", url: m.url }, m.type === "video" ? `Clip ${i + 1}` : `Photo ${i + 1}`)));
        if (live) setP({ clips, aspect: "original", look: "none", texts: [], logo: null, song: null });
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : "A clip wouldn't open.");
      }
    })();
    return () => {
      live = false;
    };
  }, [media]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      songRef.current?.pause();
    };
  }, []);

  const total = p ? totalLength(p) : 0;
  const cur = p ? at(p, t) : null;
  const clip = p && cur ? p.clips[cur.index] : null;

  const update = (fn: (p: Project) => Project) => setP((prev) => (prev ? fn(prev) : prev));
  const setClip = (id: string, patch: Partial<Clip>) => update((q) => ({ ...q, clips: q.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const setText = (id: string, patch: Partial<TextItem>) => update((q) => ({ ...q, texts: q.texts.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const seek = useCallback((to: number) => {
    tRef.current = to;
    setT(to);
  }, []);

  // Paused: the preview shows the frame at t.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !clip || clip.type !== "video" || playing || !cur) return;
    const src = srcUrl(clip.source);
    if (v.dataset.src !== src) {
      v.dataset.src = src;
      v.src = src;
    }
    if (Math.abs(v.currentTime - cur.clipTime) > 0.05) v.currentTime = cur.clipTime;
  }, [clip, cur, playing]);

  // Playing: clip after clip, the song alongside.
  useEffect(() => {
    if (!playing) {
      videoRef.current?.pause();
      songRef.current?.pause();
      return;
    }
    let frame = 0;
    let last = performance.now();
    let index = -1;
    const song = pRef.current?.song;
    if (song) {
      songRef.current?.pause();
      songRef.current = new Audio(URL.createObjectURL(song.file));
      songRef.current.currentTime = song.start + tRef.current;
      songRef.current.volume = Math.min(1, song.volume);
      void songRef.current.play();
    }
    const tick = (now: number) => {
      const q = pRef.current;
      const v = videoRef.current;
      if (!q) return;
      const dt = (now - last) / 1000;
      last = now;
      const where = at(q, tRef.current);
      if (!where) return;
      const c = q.clips[where.index];
      let next = tRef.current;
      if (c.type === "video" && v) {
        if (index !== where.index) {
          index = where.index;
          const src = srcUrl(c.source);
          if (v.dataset.src !== src) {
            v.dataset.src = src;
            v.src = src;
          }
          v.currentTime = where.clipTime;
          v.volume = Math.min(1, c.volume);
          v.muted = c.volume === 0;
          void v.play().catch(() => undefined);
        }
        next = where.startsAt + Math.max(0, v.currentTime - c.in);
        if (v.currentTime >= c.out - 0.04) next = where.startsAt + used(c) + 0.001;
      } else {
        if (index !== where.index) {
          index = where.index;
          v?.pause();
        }
        next = tRef.current + dt;
      }
      if (next >= totalLength(q)) {
        seek(0);
        setPlaying(false);
        return;
      }
      seek(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, seek]);

  async function addClips(files: FileList | null) {
    if (!files?.length || !p) return;
    setError(null);
    setBusy("Adding…");
    try {
      const { probe } = await import("./render");
      const more = await Promise.all([...files].map((f) => probe({ kind: "file", file: f }, f.name)));
      update((q) => ({ ...q, clips: [...q.clips, ...more] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That file wouldn't open.");
    } finally {
      setBusy(null);
    }
  }

  async function pickSong(file: File, name: string, start: number, songId?: string) {
    setError(null);
    try {
      const ctx = new OfflineAudioContext(2, 1, 48_000);
      const length = (await ctx.decodeAudioData(await file.arrayBuffer())).duration;
      update((q) => ({ ...q, song: { file, name, start: Math.min(start, Math.max(0, length - 1)), volume: 1, length, songId } }));
    } catch {
      setError("That sound won't open. Use an MP3, M4A, WAV or an MP4/MOV video.");
    }
  }

  async function saveSound(c: Clip) {
    setBusy("Taking the sound out…");
    try {
      const { soundOnly } = await import("./render");
      const file = await soundOnly(c);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sound couldn't be taken out.");
    } finally {
      setBusy(null);
    }
  }

  async function done() {
    if (!p) return;
    setPlaying(false);
    setError(null);
    setProgress(0);
    try {
      const { render } = await import("./render");
      const file = await render(p, (s) => setProgress(s * 0.8));
      const up = await uploadMedia(file, (s) => setProgress(0.8 + s * 0.2));
      if (!up.ok) throw new Error(up.error);
      onDone([p.song?.songId ? { ...up.media, songId: p.song.songId } : up.media]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The video couldn't be made. Try again.");
      setProgress(null);
    }
  }

  function dragText(e: React.PointerEvent, id: string) {
    const stage = stageRef.current;
    if (!stage) return;
    e.preventDefault();
    setSelText(id);
    setTool("text");
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      setText(id, { x: Math.min(0.95, Math.max(0.05, (ev.clientX - r.left) / r.width)), y: Math.min(0.95, Math.max(0.05, (ev.clientY - r.top) / r.height)) });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  const size = p ? frameSize(p) : { w: 9, h: 16 };
  const ratio = size.w / size.h;
  const filter = p ? lookCss(p.look) : "none";

  const body = (
    <div className="fixed inset-0 z-[200] flex flex-col bg-gray-950 text-white">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button type="button" onClick={onClose} disabled={progress !== null} className="text-sm font-semibold text-white/70 hover:text-white">
          Cancel
        </button>
        <p className="flex-1 text-center text-sm font-semibold tnum">{p ? time(total) : "Edit video"}</p>
        <Button type="button" variant="primary" className="min-h-9" disabled={!p || progress !== null || !!busy || total <= 0} onClick={() => void done()}>
          Done
        </Button>
      </header>

      {!p ? (
        <div className="flex flex-1 items-center justify-center text-sm text-white/60">{error ?? "Opening…"}</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex shrink-0 flex-col items-center gap-3 p-4 lg:min-h-0 lg:flex-1 lg:justify-center">
            <div ref={stageRef} className="relative overflow-hidden rounded-xl bg-black shadow-2xl" style={{ aspectRatio: `${size.w} / ${size.h}`, width: `min(100%, calc(46dvh * ${ratio}))`, containerType: "inline-size" }}>
              {clip?.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- a photo clip
                <img src={srcUrl(clip.source)} alt="" className="absolute inset-0 size-full object-cover" style={{ filter }} />
              ) : null}
              <video ref={videoRef} playsInline preload="auto" className={`absolute inset-0 size-full object-cover ${clip?.type === "video" ? "" : "invisible"}`} style={{ filter }} />
              {p.texts
                .filter((x) => x.text.trim() && t >= x.start && t < x.end)
                .map((x) => (
                  <div
                    key={x.id}
                    onPointerDown={(e) => dragText(e, x.id)}
                    className={`absolute max-w-[86%] cursor-move touch-none select-none text-center ${selText === x.id && tool === "text" ? "outline-dashed outline-2 outline-offset-4 outline-white/70" : ""}`}
                    style={{ left: `${x.x * 100}%`, top: `${x.y * 100}%`, transform: "translate(-50%, -50%)", width: "max-content" }}
                  >
                    <span style={textCss(x)} className="whitespace-pre-wrap">
                      {x.text}
                    </span>
                  </div>
                ))}
              {p.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- the business's logo
                <img
                  src={srcUrl(p.logo.source)}
                  alt=""
                  className="absolute opacity-90"
                  style={{ width: `${p.logo.size * 100}%`, [p.logo.corner.startsWith("t") ? "top" : "bottom"]: "4cqw", [p.logo.corner.endsWith("l") ? "left" : "right"]: "4cqw" }}
                />
              ) : null}
            </div>
            <div className="flex w-full max-w-md items-center gap-3">
              <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying(!playing)} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-gray-950">
                {playing ? "❚❚" : "▶"}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0.01, total)}
                step={0.01}
                value={Math.min(t, total)}
                onChange={(e) => {
                  setPlaying(false);
                  seek(Number(e.target.value));
                }}
                aria-label="Time"
                className="min-w-0 flex-1 accent-brand-500"
              />
              <span className="w-20 shrink-0 text-right text-xs text-white/70 tnum">
                {time1(t)} / {time(total)}
              </span>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col border-t border-white/10 lg:w-[26rem] lg:flex-none lg:border-l lg:border-t-0">
            <nav className="flex shrink-0 justify-around border-b border-white/10 px-2">
              {TOOLS.map((x) => (
                <button key={x.key} type="button" onClick={() => setTool(x.key)} className={`flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-semibold ${tool === x.key ? "text-brand-400" : "text-white/60 hover:text-white"}`}>
                  {x.icon}
                  {x.label}
                </button>
              ))}
            </nav>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {tool === "clips" ? (
                <>
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {p.clips.map((c, i) => (
                      <button key={c.id} type="button" onClick={() => setSelClip(i)} className={`relative h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-white/5 ${selClip === i ? "ring-2 ring-brand-500" : ""}`}>
                        {c.type === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a photo clip
                          <img src={srcUrl(c.source)} alt="" className="size-full object-cover" />
                        ) : (
                          <video src={`${srcUrl(c.source)}#t=${c.in + 0.1}`} muted playsInline preload="metadata" className="size-full object-cover" />
                        )}
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[10px] font-semibold tnum">{time1(used(c))}</span>
                      </button>
                    ))}
                    <label className="flex h-24 w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-white/25 text-[11px] font-semibold text-white/70 hover:border-brand-400">
                      <span className="text-lg leading-none">＋</span>
                      Add
                      <input type="file" accept={MEDIA} multiple className="sr-only" onChange={(e) => void addClips(e.target.files)} />
                    </label>
                  </div>
                  {p.clips[selClip] ? (
                    <ClipTools
                      c={p.clips[selClip]}
                      first={selClip === 0}
                      last={selClip === p.clips.length - 1}
                      only={p.clips.length === 1}
                      onChange={(patch) => setClip(p.clips[selClip].id, patch)}
                      onMove={(d) => {
                        update((q) => {
                          const clips = [...q.clips];
                          const [c] = clips.splice(selClip, 1);
                          clips.splice(selClip + d, 0, c);
                          return { ...q, clips };
                        });
                        setSelClip(selClip + d);
                      }}
                      onRemove={() => {
                        update((q) => ({ ...q, clips: q.clips.filter((_, i) => i !== selClip) }));
                        setSelClip(Math.max(0, selClip - 1));
                        seek(0);
                      }}
                    />
                  ) : null}
                </>
              ) : null}

              {tool === "size" ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-3">
                  {ASPECTS.map((a) => {
                    const r = a.key === "original" ? (p.clips[0] ? p.clips[0].width / p.clips[0].height : 1) : Number(a.key.split(":")[0]) / Number(a.key.split(":")[1]);
                    return (
                      <button key={a.key} type="button" onClick={() => update((q) => ({ ...q, aspect: a.key as Aspect }))} className={`flex flex-col items-center gap-2 rounded-xl p-3 ${p.aspect === a.key ? "bg-brand-500/20 ring-2 ring-brand-500" : "bg-white/5 hover:bg-white/10"}`}>
                        <span className="flex h-12 items-center">
                          <span className="block rounded-[3px] border-2 border-current" style={r >= 1 ? { width: 40, height: 40 / r } : { height: 44, width: 44 * r }} />
                        </span>
                        <span className="text-xs font-semibold">{a.label}</span>
                        <span className="text-center text-[10px] leading-tight text-white/50">{a.for}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {tool === "text" ? (
                <TextTools
                  texts={p.texts}
                  sel={selText}
                  total={total}
                  onSelect={(id) => {
                    setSelText(id);
                    const x = p.texts.find((y) => y.id === id);
                    if (x) seek(x.start);
                  }}
                  onAdd={() => {
                    const id = newId();
                    update((q) => ({ ...q, texts: [...q.texts, { id, text: "", start: Math.min(t, Math.max(0, total - 1)), end: Math.min(total, t + 3), x: 0.5, y: 0.25, size: 0.07, color: "#FFFFFF", style: "box" }] }));
                    setSelText(id);
                  }}
                  onChange={setText}
                  onRemove={(id) => update((q) => ({ ...q, texts: q.texts.filter((x) => x.id !== id) }))}
                />
              ) : null}

              {tool === "look" ? (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-4">
                  {LOOKS.map((l) => (
                    <button key={l.key} type="button" onClick={() => update((q) => ({ ...q, look: l.key }))} className="space-y-1 text-center">
                      <span className={`block aspect-[3/4] overflow-hidden rounded-lg bg-white/5 ${p.look === l.key ? "ring-2 ring-brand-500" : ""}`}>
                        {p.clips[0]?.type === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element -- the first clip in this look
                          <img src={srcUrl(p.clips[0].source)} alt="" className="size-full object-cover" style={{ filter: l.css }} />
                        ) : p.clips[0] ? (
                          <video src={`${srcUrl(p.clips[0].source)}#t=${p.clips[0].in + 0.1}`} muted playsInline preload="metadata" className="size-full object-cover" style={{ filter: l.css }} />
                        ) : null}
                      </span>
                      <span className="text-[11px] font-semibold">{l.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {tool === "logo" ? (
                p.logo ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- the logo */}
                      <img src={srcUrl(p.logo.source)} alt="" className="size-14 rounded-lg bg-white/10 object-contain p-1" />
                      <div className="grid flex-1 grid-cols-2 gap-1.5">
                        {(["tl", "tr", "bl", "br"] as Corner[]).map((k) => (
                          <Chip key={k} on={p.logo?.corner === k} onClick={() => update((q) => ({ ...q, logo: q.logo ? { ...q.logo, corner: k } : null }))} label={`Corner ${k}`}>
                            {{ tl: "↖ Top left", tr: "↗ Top right", bl: "↙ Bottom left", br: "↘ Bottom right" }[k]}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <Slider label="Size" value={Math.round(p.logo.size * 100)} min={8} max={40} onChange={(v) => update((q) => ({ ...q, logo: q.logo ? { ...q.logo, size: v / 100 } : null }))} show={`${Math.round(p.logo.size * 100)}%`} />
                    <Chip onClick={() => update((q) => ({ ...q, logo: null }))}>✕ Remove logo</Chip>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/25 p-8 text-sm font-semibold text-white/70 hover:border-brand-400">
                    <span className="text-2xl leading-none">＋</span>
                    Your logo (PNG with a clear background is best)
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && update((q) => ({ ...q, logo: { source: { kind: "file", file: e.target.files![0] }, corner: "br", size: 0.18 } }))} />
                  </label>
                )
              ) : null}

              {tool === "sound" ? (
                <SoundTools
                  p={p}
                  onClip={setClip}
                  onMuteAll={() => update((q) => ({ ...q, clips: q.clips.map((c) => ({ ...c, volume: 0 })) }))}
                  onSave={(c) => void saveSound(c)}
                  onSong={(f, name, start, id) => void pickSong(f, name, start, id)}
                  onSongChange={(patch) => update((q) => ({ ...q, song: q.song ? { ...q.song, ...patch } : null }))}
                  onSongRemove={() => update((q) => ({ ...q, song: null }))}
                />
              ) : null}

              {busy ? <p className="text-xs text-white/60">{busy}</p> : null}
              {error ? <p className="text-sm text-error-400">{error}</p> : null}
            </div>
          </div>
        </div>
      )}

      {progress !== null ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-sm space-y-3 text-center">
            <p className="text-lg font-semibold">Making your video</p>
            <ProgressBar value={Math.round(progress * 100)} max={100} label="Making your video" showValue="percent" />
            <p className="text-xs text-white/60">Keep this screen open.</p>
          </div>
        </div>
      ) : null}
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(body, document.body);
}

function ClipTools({ c, first, last, only, onChange, onMove, onRemove }: { c: Clip; first: boolean; last: boolean; only: boolean; onChange: (patch: Partial<Clip>) => void; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
  return (
    <div className="space-y-3 rounded-2xl bg-white/5 p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</p>
        {!first ? (
          <Chip onClick={() => onMove(-1)} label="Move earlier">
            ◀
          </Chip>
        ) : null}
        {!last ? (
          <Chip onClick={() => onMove(1)} label="Move later">
            ▶
          </Chip>
        ) : null}
        {!only ? (
          <Chip onClick={onRemove} label="Remove clip">
            ✕
          </Chip>
        ) : null}
      </div>
      {c.type === "video" ? (
        <>
          <Slider label="Start" value={c.in} min={0} max={c.length} step={0.1} onChange={(v) => onChange({ in: Math.min(v, c.out - 0.5) })} show={time1(c.in)} />
          <Slider label="End" value={c.out} min={0} max={c.length} step={0.1} onChange={(v) => onChange({ out: Math.max(v, c.in + 0.5) })} show={time1(c.out)} />
        </>
      ) : (
        <Slider label="Shows" value={c.out} min={1} max={10} step={0.5} onChange={(v) => onChange({ out: v, length: v })} show={`${c.out}s`} />
      )}
    </div>
  );
}

function TextTools({ texts, sel, total, onSelect, onAdd, onChange, onRemove }: { texts: TextItem[]; sel: string | null; total: number; onSelect: (id: string) => void; onAdd: () => void; onChange: (id: string, patch: Partial<TextItem>) => void; onRemove: (id: string) => void }) {
  const x = texts.find((y) => y.id === sel);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {texts.map((y) => (
          <Chip key={y.id} on={y.id === sel} onClick={() => onSelect(y.id)}>
            <span className="max-w-28 truncate">{y.text.trim() || "New words"}</span>
          </Chip>
        ))}
        <Chip onClick={onAdd}>＋ Words</Chip>
      </div>
      {x ? (
        <div className="space-y-3 rounded-2xl bg-white/5 p-3">
          <textarea value={x.text} onChange={(e) => onChange(x.id, { text: e.target.value })} rows={2} maxLength={200} placeholder="Type here, then drag it on the video" autoFocus className="w-full resize-none rounded-xl bg-black/40 p-3 text-sm text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-brand-500" />
          <div className="flex flex-wrap gap-2">
            {(["plain", "box", "glow"] as TextStyle[]).map((s) => (
              <Chip key={s} on={x.style === s} onClick={() => onChange(x.id, { style: s })}>
                {{ plain: "Outline", box: "Box", glow: "Glow" }[s]}
              </Chip>
            ))}
            <span className="flex items-center gap-1.5 pl-1">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => onChange(x.id, { color: c })} className={`size-6 rounded-full border border-white/30 ${x.color === c ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-gray-950" : ""}`} style={{ background: c }} />
              ))}
            </span>
          </div>
          <Slider label="Size" value={Math.round(x.size * 100)} min={3} max={15} onChange={(v) => onChange(x.id, { size: v / 100 })} show={String(Math.round(x.size * 100))} />
          <Slider label="From" value={x.start} min={0} max={total} step={0.1} onChange={(v) => onChange(x.id, { start: Math.min(v, x.end - 0.5) })} show={time1(x.start)} />
          <Slider label="To" value={x.end} min={0} max={total} step={0.1} onChange={(v) => onChange(x.id, { end: Math.max(v, x.start + 0.5) })} show={time1(x.end)} />
          <Chip onClick={() => onRemove(x.id)}>✕ Remove</Chip>
        </div>
      ) : null}
    </div>
  );
}

function SoundTools({
  p,
  onClip,
  onMuteAll,
  onSave,
  onSong,
  onSongChange,
  onSongRemove,
}: {
  p: Project;
  onClip: (id: string, patch: Partial<Clip>) => void;
  onMuteAll: () => void;
  onSave: (c: Clip) => void;
  onSong: (file: File, name: string, start: number, songId?: string) => void;
  onSongChange: (patch: Partial<NonNullable<Project["song"]>>) => void;
  onSongRemove: () => void;
}) {
  const [songs, setSongs] = useState<LibrarySong[] | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const withSound = p.clips.filter((c) => c.type === "video" && c.hasSound);

  useEffect(() => {
    if (!p.song && !songs) void amingSongs().then((res) => setSongs(res.ok ? res.data : []));
  }, [p.song, songs]);

  async function library(s: LibrarySong) {
    setLoading(s.id);
    try {
      const blob = await (await fetch(readableUrl(s.audioUrl))).blob();
      onSong(new File([blob], `${s.title}.mp3`, { type: blob.type }), `${s.title} · ${s.artist}`, s.hookAt, s.id);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {withSound.length ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Clips&apos; own sound</p>
            <Chip onClick={onMuteAll}>🔇 Mute all</Chip>
          </div>
          {withSound.map((c) => (
            <div key={c.id} className="space-y-1 rounded-xl bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</p>
                <Chip on={c.volume === 0} onClick={() => onClip(c.id, { volume: c.volume === 0 ? 1 : 0 })} label={c.volume === 0 ? "Unmute" : "Mute"}>
                  {c.volume === 0 ? "🔇" : "🔊"}
                </Chip>
                <Chip onClick={() => onSave(c)} label="Save this sound">
                  ⬇ Sound
                </Chip>
              </div>
              <Slider label="Volume" value={Math.round(c.volume * 100)} min={0} max={150} onChange={(v) => onClip(c.id, { volume: v / 100 })} show={`${Math.round(c.volume * 100)}%`} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Song</p>
        {p.song ? (
          <div className="space-y-2 rounded-xl bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">♪ {p.song.name}</p>
              <Chip onClick={onSongRemove} label="Remove song">
                ✕
              </Chip>
            </div>
            {p.song.length > 5 ? <Slider label="Starts at" value={p.song.start} min={0} max={Math.floor(p.song.length - 1)} onChange={(v) => onSongChange({ start: v })} show={time(p.song.start)} /> : null}
            <Slider label="Volume" value={Math.round(p.song.volume * 100)} min={0} max={150} onChange={(v) => onSongChange({ volume: v / 100 })} show={`${Math.round(p.song.volume * 100)}%`} />
          </div>
        ) : (
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            <label className="flex size-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-white/25 text-center text-[11px] font-semibold leading-tight text-white/70 hover:border-brand-400">
              <span className="text-lg leading-none">＋</span>
              Song or video
              <input type="file" accept={SOUND} className="sr-only" onChange={(e) => e.target.files?.[0] && onSong(e.target.files[0], e.target.files[0].name, 0)} />
            </label>
            {!songs ? [0, 1, 2].map((i) => <span key={i} className="size-20 shrink-0 animate-pulse rounded-xl bg-white/5" />) : null}
            {songs?.map((s) => (
              <button key={s.id} type="button" disabled={loading !== null} onClick={() => void library(s)} className="w-20 shrink-0 text-left disabled:opacity-60">
                <span className="block size-20 overflow-hidden rounded-xl bg-gradient-to-br from-brand-500 to-brand-700">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the song's cover */}
                  {s.coverUrl ? <img src={s.coverUrl} alt="" className="size-full object-cover" /> : null}
                </span>
                <span className="mt-1 block truncate text-[11px] font-medium">{s.title}</span>
                <span className="block truncate text-[10px] text-white/50">{s.artist}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
