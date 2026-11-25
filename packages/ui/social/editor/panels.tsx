"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { amingSongs } from "@repo/lib/social/actions";
import type { Song as LibrarySong } from "@repo/lib/social/core";

import * as Icon from "./icons";
import { ASPECTS, readableUrl, FONTS, LOOKS, TEXT_ANIMS, TEXT_STYLES, TRANSITIONS, filterCss, fontCss, labelInk, type Adjust, type Aspect, type Clip, type Corner, type Project, type TextItem, type Transition } from "./model";
import { useStrip } from "./Timeline";

export const COLORS = ["#FFFFFF", "#000000", "#FFD400", "#FF8A00", "#FE2C55", "#FF4FD8", "#8B5CF6", "#25F4EE", "#22C55E", "#2563EB"];
export const SOUND = "audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.aac,.wav,video/mp4,video/quicktime,.mp4,.mov";

/** The words as the export draws them, in CSS (sizes in container widths). */
export function textCss(item: TextItem): CSSProperties {
  const f = fontCss(item.font);
  const base: CSSProperties = { fontFamily: f.css, fontSize: `${item.size * 100}cqw`, fontWeight: f.weight, lineHeight: 1.2, color: item.color };
  const box = (bg: string, color: string): CSSProperties => ({ ...base, color, background: bg, padding: "0 0.3em", borderRadius: "0.22em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" });
  switch (item.style) {
    case "box":
      return box("rgba(0,0,0,0.62)", item.color);
    case "label":
      return box(item.color, labelInk(item.color));
    case "glow":
      return { ...base, color: "#fff", textShadow: `0 0 0.25em ${item.color}, 0 0 0.5em ${item.color}` };
    case "shadow":
      return { ...base, textShadow: "0.06em 0.08em 0.12em rgba(0,0,0,0.85)" };
    default:
      return { ...base, WebkitTextStroke: "0.12em rgba(0,0,0,0.8)", paintOrder: "stroke fill" };
  }
}

function Tile({ on, onClick, children, label, className = "" }: { on: boolean; onClick: () => void; children: ReactNode; label: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={`flex shrink-0 flex-col items-center gap-1.5 ${className}`}>
      <span className={`flex w-full items-center justify-center overflow-hidden rounded-xl bg-white/[0.07] transition ${on ? "ring-2 ring-brand-500" : "hover:bg-white/[0.12]"}`}>{children}</span>
      <span className={`text-[11px] font-medium ${on ? "text-white" : "text-white/60"}`}>{label}</span>
    </button>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, show }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; show: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block space-y-2">
      <span className="flex justify-between text-xs">
        <span className="text-white/60">{label}</span>
        <span className="font-semibold tnum">{show}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
        style={{ background: `linear-gradient(to right, var(--color-brand-500) ${pct}%, rgba(255,255,255,0.15) ${pct}%)` }}
      />
    </label>
  );
}

const Row = ({ children }: { children: ReactNode }) => (
  <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" style={{ scrollbarWidth: "none" }}>
    {children}
  </div>
);

export function TextPanel({ x, onChange }: { x: TextItem; onChange: (patch: Partial<TextItem>) => void }) {
  return (
    <div className="space-y-4">
      <textarea
        value={x.text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={2}
        maxLength={200}
        placeholder="Enter text"
        autoFocus
        className="w-full resize-none rounded-xl bg-white/[0.07] p-3 text-base text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-brand-500"
      />
      <Row>
        {FONTS.map((f) => (
          <Tile key={f.key} on={x.font === f.key} onClick={() => onChange({ font: f.key })} label={f.label} className="w-16">
            <span className="flex h-12 items-center text-xl" style={{ fontFamily: f.css, fontWeight: f.weight }}>
              Aa
            </span>
          </Tile>
        ))}
      </Row>
    </div>
  );
}

export function StylePanel({ x, onChange }: { x: TextItem; onChange: (patch: Partial<TextItem>) => void }) {
  return (
    <div className="space-y-4">
      <Row>
        {TEXT_STYLES.map((s) => (
          <Tile key={s.key} on={x.style === s.key} onClick={() => onChange({ style: s.key })} label={s.label} className="w-16">
            <span className="flex h-12 items-center [container-type:inline-size]" style={{ width: 64 }}>
              <span className="mx-auto" style={{ ...textCss({ ...x, style: s.key, size: 0.32 }) }}>
                Aa
              </span>
            </span>
          </Tile>
        ))}
      </Row>
      <div className="flex flex-wrap gap-2.5">
        {COLORS.map((c) => (
          <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => onChange({ color: c })} className={`size-8 rounded-full border border-white/25 ${x.color === c ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-[#17171c]" : ""}`} style={{ background: c }} />
        ))}
      </div>
      <Slider label="Size" value={Math.round(x.size * 100)} min={3} max={18} onChange={(v) => onChange({ size: v / 100 })} show={String(Math.round(x.size * 100))} />
    </div>
  );
}

export function AnimPanel({ x, onChange, onPreview }: { x: TextItem; onChange: (patch: Partial<TextItem>) => void; onPreview: () => void }) {
  return (
    <Row>
      {TEXT_ANIMS.map((a) => (
        <Tile
          key={a.key}
          on={x.anim === a.key}
          onClick={() => {
            onChange({ anim: a.key });
            onPreview();
          }}
          label={a.label}
          className="w-[4.5rem]"
        >
          <span className="flex h-14 items-center text-lg font-extrabold">
            {{ none: <Icon.Close className="size-5 text-white/50" />, pop: <span className="animate-bounce">Aa</span>, fade: <span className="animate-pulse">Aa</span>, rise: <span className="translate-y-0.5">Aa↑</span>, type: <span>A▍</span> }[a.key]}
          </span>
        </Tile>
      ))}
    </Row>
  );
}

export function FiltersPanel({ p, onLook }: { p: Project; onLook: (look: Project["look"]) => void }) {
  const first = p.clips[0];
  const s = useStrip(first);
  const thumb = s?.urls[Math.min(s.urls.length - 1, 1)];
  return (
    <Row>
      {LOOKS.map((l) => (
        <Tile key={l.key} on={p.look === l.key} onClick={() => onLook(l.key)} label={l.label} className="w-16">
          <span className="block aspect-[3/4] w-full bg-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element -- the first clip in this look */}
            {thumb ? <img src={thumb} alt="" className="size-full object-cover" style={{ filter: filterCss({ ...p, look: l.key, adjust: { brightness: 0, contrast: 0, saturation: 0 } }) }} /> : null}
          </span>
        </Tile>
      ))}
    </Row>
  );
}

export function AdjustPanel({ a, onChange }: { a: Adjust; onChange: (a: Adjust) => void }) {
  const items: { key: keyof Adjust; label: string }[] = [
    { key: "brightness", label: "Brightness" },
    { key: "contrast", label: "Contrast" },
    { key: "saturation", label: "Saturation" },
  ];
  return (
    <div className="space-y-4">
      {items.map((i) => (
        <Slider key={i.key} label={i.label} value={a[i.key]} min={-50} max={50} onChange={(v) => onChange({ ...a, [i.key]: v })} show={a[i.key] > 0 ? `+${a[i.key]}` : String(a[i.key])} />
      ))}
      {a.brightness || a.contrast || a.saturation ? (
        <button type="button" onClick={() => onChange({ brightness: 0, contrast: 0, saturation: 0 })} className="text-xs font-semibold text-brand-400">
          Reset
        </button>
      ) : null}
    </div>
  );
}

export function RatioPanel({ p, onAspect }: { p: Project; onAspect: (a: Aspect) => void }) {
  return (
    <Row>
      {ASPECTS.map((a) => {
        const r = a.key === "original" ? (p.clips[0] ? p.clips[0].width / p.clips[0].height : 1) : Number(a.key.split(":")[0]) / Number(a.key.split(":")[1]);
        return (
          <Tile key={a.key} on={p.aspect === a.key} onClick={() => onAspect(a.key)} label={a.label} className="w-[4.5rem]">
            <span className="flex h-16 flex-col items-center justify-center gap-1">
              <span className="block rounded-[3px] border-2 border-current" style={r >= 1 ? { width: 34, height: 34 / r } : { height: 36, width: 36 * r }} />
              <span className="text-[9px] leading-none text-white/50">{a.for.split(" · ")[0]}</span>
            </span>
          </Tile>
        );
      })}
    </Row>
  );
}

export function LogoPanel({ p, onChange }: { p: Project; onChange: (logo: Project["logo"]) => void }) {
  const logo = p.logo;
  if (!logo)
    return (
      <label className="flex cursor-pointer items-center gap-4 rounded-2xl bg-white/[0.07] p-4 hover:bg-white/[0.12]">
        <span className="flex size-14 items-center justify-center rounded-xl border-2 border-dashed border-white/25">
          <Icon.Plus className="size-6" />
        </span>
        <span>
          <span className="block text-sm font-semibold">Add your logo</span>
          <span className="block text-xs text-white/50">PNG with a clear background looks best</span>
        </span>
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && onChange({ source: { kind: "file", file: e.target.files[0] }, corner: "br", size: 0.18 })} />
      </label>
    );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="grid size-24 shrink-0 grid-cols-2 gap-1 rounded-xl bg-white/[0.07] p-1">
          {(["tl", "tr", "bl", "br"] as Corner[]).map((k) => (
            <button key={k} type="button" aria-label={`Corner ${k}`} onClick={() => onChange({ ...logo, corner: k })} className={`rounded-lg ${logo.corner === k ? "bg-brand-500" : "bg-white/10 hover:bg-white/20"}`} />
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <Slider label="Size" value={Math.round(logo.size * 100)} min={8} max={40} onChange={(v) => onChange({ ...logo, size: v / 100 })} show={`${Math.round(logo.size * 100)}%`} />
          <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white">
            <Icon.Trash className="size-4" /> Remove logo
          </button>
        </div>
      </div>
    </div>
  );
}

export function TransitionPanel({ c, onPick, onAll }: { c: Clip; onPick: (t: Transition) => void; onAll: () => void }) {
  const demo: Record<Transition, string> = { none: "", fade: "animate-pulse", dissolve: "animate-pulse", flash: "animate-ping", zoom: "animate-bounce", slide: "animate-bounce" };
  return (
    <div className="space-y-4">
      <Row>
        {TRANSITIONS.map((x) => (
          <Tile key={x.key} on={c.transition === x.key} onClick={() => onPick(x.key)} label={x.label} className="w-16">
            <span className="flex h-14 w-full items-center justify-center bg-gradient-to-r from-sky-700 to-brand-700">
              {x.key === "none" ? <Icon.Close className="size-5 text-white/70" /> : <span className={`block size-4 rounded-sm bg-white/90 ${demo[x.key]}`} />}
            </span>
          </Tile>
        ))}
      </Row>
      <button type="button" onClick={onAll} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15">
        <Icon.Check className="size-4" /> Apply to all
      </button>
    </div>
  );
}

export function AudioPanel({ onPick }: { onPick: (file: File, name: string, start: number, songId?: string) => void }) {
  const [songs, setSongs] = useState<LibrarySong[] | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void amingSongs().then((res) => setSongs(res.ok ? res.data : []));
    return () => audio.current?.pause();
  }, []);

  function listen(s: LibrarySong) {
    audio.current?.pause();
    if (playing === s.id) return setPlaying(null);
    audio.current = new Audio(s.audioUrl);
    audio.current.currentTime = s.hookAt;
    audio.current.onended = () => setPlaying(null);
    void audio.current.play().catch(() => undefined);
    setPlaying(s.id);
  }

  async function use(s: LibrarySong) {
    setLoading(s.id);
    audio.current?.pause();
    try {
      const blob = await (await fetch(readableUrl(s.audioUrl))).blob();
      onPick(new File([blob], `${s.title}.mp3`, { type: blob.type }), `${s.title} · ${s.artist}`, s.hookAt, s.id);
    } finally {
      setLoading(null);
    }
  }

  const shown = songs?.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Aming music" className="min-w-0 flex-1 rounded-full bg-white/[0.07] px-4 py-2 text-sm outline-none placeholder:text-white/40 focus:ring-2 focus:ring-brand-500" />
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-gray-950">
          <Icon.Plus className="size-4" /> Upload
          <input type="file" accept={SOUND} className="sr-only" onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0], e.target.files[0].name.replace(/\.[^.]+$/, ""), 0)} />
        </label>
      </div>
      <p className="text-[11px] text-white/40">Upload any song, or a video to use its sound.</p>
      <ul className="space-y-1">
        {!shown
          ? [0, 1, 2].map((i) => <li key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />)
          : shown.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-white/5">
                <button type="button" onClick={() => listen(s)} aria-label={playing === s.id ? "Stop" : "Listen"} className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-brand-500 to-brand-700">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the song's cover */}
                  {s.coverUrl ? <img src={s.coverUrl} alt="" className="size-full object-cover" /> : null}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">{playing === s.id ? <Icon.Pause className="size-4" /> : <Icon.Play className="size-4" />}</span>
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.title}</span>
                  <span className="block truncate text-xs text-white/50">{s.artist}</span>
                </span>
                <button type="button" disabled={loading !== null} onClick={() => void use(s)} className="rounded-full bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {loading === s.id ? "…" : "Use"}
                </button>
              </li>
            ))}
        {shown && !shown.length ? <li className="py-6 text-center text-xs text-white/40">{songs?.length ? "No song matches." : "No Aming music yet. Upload your own."}</li> : null}
      </ul>
    </div>
  );
}
