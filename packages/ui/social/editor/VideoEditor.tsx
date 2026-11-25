"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { PostMedia } from "@repo/lib/social/core";

import { uploadMedia } from "../MediaPicker";
import * as Icon from "./icons";
import { at, filterCss, frameSize, newId, srcUrl, starts, textAt, totalLength, transitionAt, used, type Clip, type Project, type TextItem } from "./model";
import { AdjustPanel, AnimPanel, AudioPanel, FiltersPanel, LogoPanel, RatioPanel, Slider, StylePanel, TextPanel, TransitionPanel, textCss } from "./panels";
import { Timeline, useStrip, type Sel } from "./Timeline";

type Panel = "text" | "style" | "anim" | "filters" | "adjust" | "ratio" | "logo" | "audio" | "volume" | "transition" | "duration";

const PANEL_TITLE: Record<Panel, string> = {
  text: "Text",
  style: "Style",
  anim: "Animation",
  filters: "Filters",
  adjust: "Adjust",
  ratio: "Ratio",
  logo: "Logo",
  audio: "Music",
  volume: "Volume",
  transition: "Transition",
  duration: "Duration",
};

const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const time1 = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;

function Tool({ icon, label, onClick, disabled, on }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; on?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-[4.25rem] shrink-0 flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition disabled:opacity-30 ${on ? "text-brand-400" : "text-white/80 hover:bg-white/5 hover:text-white"}`}
    >
      <span className="flex size-6 items-center justify-center">{icon}</span>
      {label}
    </button>
  );
}

// The video editor (owner, 2026-11-25: "rebuild it like CapCut"). Full screen:
// the preview on top, play and undo under it, the timeline (frames, words and
// music on their own tracks, the playhead in the middle), and a tool bar that
// changes with what's selected. Tools open in a panel: a sheet over the
// timeline on a phone, a side column on a computer. Done makes the video in
// the browser (./render.ts) and it replaces the post's photos and videos.
export function VideoEditor({ media, onDone, onClose }: { media: PostMedia[]; onDone: (next: PostMedia[]) => void; onClose: () => void }) {
  const [p, setP] = useState<Project | null>(null);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [pps, setPps] = useState(48);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const songRef = useRef<HTMLAudioElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const tRef = useRef(0);
  const pRef = useRef<Project | null>(null);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const lastEdit = useRef(0);

  // The post's photos and videos become the first clips.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { probe } = await import("./render");
        const clips = await Promise.all(media.map((m, i) => probe({ kind: "url", url: m.url }, m.type === "video" ? `Clip ${i + 1}` : `Photo ${i + 1}`)));
        if (!live) return;
        const first: Project = { clips, aspect: "original", look: "none", texts: [], logo: null, song: null, adjust: { brightness: 0, contrast: 0, saturation: 0 } };
        pRef.current = first;
        setP(first);
        const w = areaRef.current?.clientWidth ?? 360;
        setPps(Math.min(120, Math.max(16, (w * 0.7) / Math.max(1, totalLength(first)))));
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

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [p === null]); // eslint-disable-line react-hooks/exhaustive-deps -- the area exists once the project opens

  /** Every change goes through here: quick changes in a row (a drag, a slider) undo as one. */
  const update = useCallback((fn: (q: Project) => Project) => {
    const prev = pRef.current;
    if (!prev) return;
    const next = fn(prev);
    if (next === prev) return;
    const now = performance.now();
    if (now - lastEdit.current > 600) past.current = [...past.current.slice(-59), prev];
    lastEdit.current = now;
    future.current = [];
    pRef.current = next;
    setP(next);
    setHist({ undo: past.current.length, redo: 0 });
  }, []);

  const undo = useCallback((redo = false) => {
    const from = redo ? future : past;
    const to = redo ? past : future;
    const target = from.current.pop();
    if (!target || !pRef.current) return;
    to.current.push(pRef.current);
    pRef.current = target;
    lastEdit.current = 0;
    setP(target);
    setHist({ undo: past.current.length, redo: future.current.length });
  }, []);

  const total = p ? totalLength(p) : 0;
  const cur = p ? at(p, Math.min(t, Math.max(0, total - 0.001))) : null;
  const clip = p && cur ? p.clips[cur.index] : null;
  const selClip = p && (sel?.kind === "clip" || sel?.kind === "transition") ? (p.clips.find((c) => c.id === sel.id) ?? null) : null;
  const selText = p && sel?.kind === "text" ? (p.texts.find((x) => x.id === sel.id) ?? null) : null;

  const setClip = useCallback((id: string, patch: Partial<Clip>) => update((q) => ({ ...q, clips: q.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) })), [update]);
  const setText = useCallback((id: string, patch: Partial<TextItem>) => update((q) => ({ ...q, texts: q.texts.map((x) => (x.id === id ? { ...x, ...patch } : x)) })), [update]);

  const seek = useCallback((to: number) => {
    tRef.current = to;
    setT(to);
  }, []);

  const select = useCallback((s: Sel) => {
    setSel(s);
    setPanel(s?.kind === "transition" ? "transition" : null);
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
    let late: ReturnType<typeof setTimeout> | undefined;
    const song = pRef.current?.song;
    if (song && song.volume > 0) {
      songRef.current?.pause();
      const a = new Audio(srcUrl({ kind: "file", file: song.file }));
      songRef.current = a;
      a.volume = Math.min(1, song.volume);
      const from = song.start + tRef.current;
      if (from >= 0) {
        a.currentTime = from;
        void a.play().catch(() => undefined);
      } else late = setTimeout(() => void a.play().catch(() => undefined), -from * 1000);
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
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(late);
    };
  }, [playing, seek]);

  async function addClips(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy("Adding clips…");
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
      setSel({ kind: "song" });
      setPanel(null);
    } catch {
      setError("That sound won't open. Use an MP3, M4A, WAV or an MP4/MOV video.");
    }
  }

  /** The clip's sound onto the music track (lined up with the clip), and the clip muted. */
  async function extract(c: Clip) {
    const q = pRef.current;
    if (!q) return;
    setBusy("Taking the sound out…");
    try {
      const { soundOnly } = await import("./render");
      const file = await soundOnly(c);
      const ctx = new OfflineAudioContext(2, 1, 48_000);
      const length = (await ctx.decodeAudioData(await file.arrayBuffer())).duration;
      const startsAt = starts(q)[q.clips.findIndex((x) => x.id === c.id)] ?? 0;
      update((r) => ({ ...r, clips: r.clips.map((x) => (x.id === c.id ? { ...x, volume: 0 } : x)), song: { file, name: `${c.name} · sound`, start: -startsAt, volume: 1, length } }));
      setSel({ kind: "song" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sound couldn't be taken out.");
    } finally {
      setBusy(null);
    }
  }

  async function saveSound(c: Clip) {
    setBusy("Saving the sound…");
    try {
      const { soundOnly } = await import("./render");
      const file = await soundOnly(c);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sound couldn't be saved.");
    } finally {
      setBusy(null);
    }
  }

  function split() {
    const q = pRef.current;
    if (!q) return;
    const where = at(q, tRef.current);
    if (!where) return;
    const c = q.clips[where.index];
    const cut = where.clipTime;
    if (cut - c.in < 0.2 || c.out - cut < 0.2) return setError("Move the playhead inside the clip to split it.");
    setError(null);
    const a: Clip = c.type === "image" ? { ...c, out: cut, length: cut } : { ...c, out: cut };
    const b: Clip = c.type === "image" ? { ...c, id: newId(), in: 0, out: c.out - cut, length: c.out - cut, transition: "none" } : { ...c, id: newId(), in: cut, transition: "none" };
    update((r) => ({ ...r, clips: r.clips.flatMap((x) => (x.id === c.id ? [a, b] : [x])) }));
    setSel({ kind: "clip", id: b.id });
  }

  function removeSelected() {
    if (!sel) return;
    if (sel.kind === "clip") {
      if ((pRef.current?.clips.length ?? 0) < 2) return setError("A video needs at least one clip.");
      update((q) => ({ ...q, clips: q.clips.filter((c) => c.id !== sel.id) }));
      seek(Math.min(tRef.current, Math.max(0, totalLength(pRef.current!) - 0.01)));
    } else if (sel.kind === "text") update((q) => ({ ...q, texts: q.texts.filter((x) => x.id !== sel.id) }));
    else if (sel.kind === "song") update((q) => ({ ...q, song: null }));
    select(null);
  }

  function addText() {
    const q = pRef.current;
    if (!q) return;
    const tot = totalLength(q);
    const start = Math.min(tRef.current, Math.max(0, tot - 1));
    const id = newId();
    update((r) => ({ ...r, texts: [...r.texts, { id, text: "", start, end: Math.min(tot, start + 3), x: 0.5, y: 0.3, size: 0.08, color: "#FFFFFF", style: "plain", font: "sans", anim: "pop" }] }));
    setPlaying(false);
    setSel({ kind: "text", id });
    setPanel("text");
  }

  function moveClip(d: -1 | 1) {
    if (sel?.kind !== "clip") return;
    update((q) => {
      const i = q.clips.findIndex((c) => c.id === sel.id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= q.clips.length) return q;
      const clips = [...q.clips];
      [clips[i], clips[j]] = [clips[j], clips[i]];
      return { ...q, clips };
    });
  }

  async function done() {
    const q = pRef.current;
    if (!q) return;
    setPlaying(false);
    setError(null);
    setProgress(0);
    try {
      const { render } = await import("./render");
      const file = await render(q, (s) => setProgress(s * 0.85));
      const up = await uploadMedia(file, (s) => setProgress(0.85 + s * 0.15));
      if (!up.ok) throw new Error(up.error);
      onDone([q.song?.songId ? { ...up.media, songId: q.song.songId } : up.media]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The video couldn't be made. Try again.");
      setProgress(null);
    }
  }

  // Keys on a computer: space plays, ⌘Z undoes, ⇧⌘Z redoes, Delete removes what's selected.
  const keys = useRef({ undo, removeSelected });
  useEffect(() => {
    keys.current = { undo, removeSelected };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((x) => !x);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        keys.current.undo(e.shiftKey);
      } else if (e.key === "Delete" || e.key === "Backspace") keys.current.removeSelected();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function dragText(e: React.PointerEvent, x: TextItem, mode: "move" | "size") {
    const stage = stageRef.current;
    if (!stage) return;
    e.preventDefault();
    e.stopPropagation();
    setPlaying(false);
    if (sel?.kind !== "text" || sel.id !== x.id) {
      setSel({ kind: "text", id: x.id });
      setPanel(null);
    }
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const r = stage.getBoundingClientRect();
    const cx = r.left + x.x * r.width;
    const cy = r.top + x.y * r.height;
    const d0 = Math.max(10, Math.hypot(e.clientX - cx, e.clientY - cy));
    const move = (ev: PointerEvent) => {
      if (mode === "move") setText(x.id, { x: Math.min(0.95, Math.max(0.05, (ev.clientX - r.left) / r.width)), y: Math.min(0.95, Math.max(0.05, (ev.clientY - r.top) / r.height)) });
      else setText(x.id, { size: Math.min(0.2, Math.max(0.03, (x.size * Math.hypot(ev.clientX - cx, ev.clientY - cy)) / d0)) });
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
  const stageW = Math.max(0, Math.min(area.w - 24, (area.h - 24) * ratio));
  const filter = p ? filterCss(p) : "none";
  const tr = p ? transitionAt(p, t) : null;
  const prevClip = p && tr ? p.clips[tr.index - 1] : null;
  const prevStrip = useStrip(prevClip);
  const prevFrame = prevStrip?.urls.at(-1);
  const mediaStyle = tr?.kind === "zoom" ? { transform: `scale(${1 + 0.3 * (1 - tr.k) ** 2})` } : tr?.kind === "slide" ? { transform: `translateX(${(1 - tr.k) ** 3 * 100}%)` } : undefined;

  // The tool bar: the main tools, or what can be done to the selected thing.
  let tools: ReactNode;
  if (!p) tools = null;
  else if (sel?.kind === "clip" && selClip) {
    const i = p.clips.findIndex((c) => c.id === selClip.id);
    tools = (
      <>
        <Tool icon={<Icon.Split />} label="Split" onClick={split} />
        {selClip.type === "video" ? <Tool icon={<Icon.Volume />} label="Volume" on={panel === "volume"} onClick={() => setPanel("volume")} disabled={!selClip.hasSound} /> : <Tool icon={<Icon.Timer />} label="Duration" on={panel === "duration"} onClick={() => setPanel("duration")} />}
        {selClip.type === "video" ? <Tool icon={<Icon.Extract />} label="Extract audio" onClick={() => void extract(selClip)} disabled={!selClip.hasSound || !!busy} /> : null}
        {selClip.type === "video" ? <Tool icon={<Icon.Download />} label="Save sound" onClick={() => void saveSound(selClip)} disabled={!selClip.hasSound || !!busy} /> : null}
        <Tool icon={<Icon.Filters />} label="Filters" on={panel === "filters"} onClick={() => setPanel("filters")} />
        <Tool icon={<Icon.Copy />} label="Duplicate" onClick={() => update((q) => ({ ...q, clips: q.clips.flatMap((c) => (c.id === selClip.id ? [c, { ...c, id: newId(), transition: "none" as const }] : [c])) }))} />
        <Tool icon={<Icon.ArrowLeft />} label="Move left" onClick={() => moveClip(-1)} disabled={i === 0} />
        <Tool icon={<Icon.ArrowRight />} label="Move right" onClick={() => moveClip(1)} disabled={i === p.clips.length - 1} />
        <Tool icon={<Icon.Trash />} label="Delete" onClick={removeSelected} disabled={p.clips.length < 2} />
      </>
    );
  } else if (sel?.kind === "text" && selText) {
    tools = (
      <>
        <Tool icon={<Icon.Edit />} label="Edit" on={panel === "text"} onClick={() => setPanel("text")} />
        <Tool icon={<Icon.Style />} label="Style" on={panel === "style"} onClick={() => setPanel("style")} />
        <Tool icon={<Icon.Animate />} label="Animation" on={panel === "anim"} onClick={() => setPanel("anim")} />
        <Tool
          icon={<Icon.Copy />}
          label="Duplicate"
          onClick={() => {
            const id = newId();
            update((q) => ({ ...q, texts: [...q.texts, { ...selText, id, y: Math.min(0.9, selText.y + 0.08) }] }));
            setSel({ kind: "text", id });
          }}
        />
        <Tool icon={<Icon.Trash />} label="Delete" onClick={removeSelected} />
      </>
    );
  } else if (sel?.kind === "song" && p.song) {
    tools = (
      <>
        <Tool icon={<Icon.Volume />} label="Volume" on={panel === "volume"} onClick={() => setPanel("volume")} />
        <Tool icon={<Icon.Replace />} label="Replace" on={panel === "audio"} onClick={() => setPanel("audio")} />
        <Tool icon={<Icon.Trash />} label="Delete" onClick={removeSelected} />
      </>
    );
  } else if (sel?.kind === "transition" && selClip) {
    tools = <Tool icon={<Icon.Transition />} label="Transition" on onClick={() => setPanel("transition")} />;
  } else {
    tools = (
      <>
        <Tool icon={<Icon.Scissors />} label="Edit" onClick={() => clip && select({ kind: "clip", id: clip.id })} />
        <Tool icon={<Icon.Music />} label="Music" on={panel === "audio"} onClick={() => setPanel("audio")} />
        <Tool icon={<Icon.Text />} label="Text" onClick={addText} />
        <Tool icon={<Icon.Filters />} label="Filters" on={panel === "filters"} onClick={() => setPanel("filters")} />
        <Tool icon={<Icon.Adjust />} label="Adjust" on={panel === "adjust"} onClick={() => setPanel("adjust")} />
        <Tool icon={<Icon.Ratio />} label="Ratio" on={panel === "ratio"} onClick={() => setPanel("ratio")} />
        <Tool icon={<Icon.Sticker />} label="Logo" on={panel === "logo"} onClick={() => setPanel("logo")} />
      </>
    );
  }

  let panelBody: ReactNode = null;
  if (p && panel) {
    if (panel === "text" && selText) panelBody = <TextPanel x={selText} onChange={(patch) => setText(selText.id, patch)} />;
    else if (panel === "style" && selText) panelBody = <StylePanel x={selText} onChange={(patch) => setText(selText.id, patch)} />;
    else if (panel === "anim" && selText)
      panelBody = (
        <AnimPanel
          x={selText}
          onChange={(patch) => setText(selText.id, patch)}
          onPreview={() => {
            seek(selText.start);
            setPlaying(true);
          }}
        />
      );
    else if (panel === "filters") panelBody = <FiltersPanel p={p} onLook={(look) => update((q) => ({ ...q, look }))} />;
    else if (panel === "adjust") panelBody = <AdjustPanel a={p.adjust} onChange={(adjust) => update((q) => ({ ...q, adjust }))} />;
    else if (panel === "ratio") panelBody = <RatioPanel p={p} onAspect={(aspect) => update((q) => ({ ...q, aspect }))} />;
    else if (panel === "logo") panelBody = <LogoPanel p={p} onChange={(logo) => update((q) => ({ ...q, logo }))} />;
    else if (panel === "audio") panelBody = <AudioPanel onPick={(f, name, start, id) => void pickSong(f, name, start, id)} />;
    else if (panel === "transition" && selClip)
      panelBody = <TransitionPanel c={selClip} onPick={(k) => setClip(selClip.id, { transition: k })} onAll={() => update((q) => ({ ...q, clips: q.clips.map((c) => ({ ...c, transition: selClip.transition })) }))} />;
    else if (panel === "duration" && selClip) {
      panelBody = <Slider label="Shows for" value={selClip.out} min={0.5} max={15} step={0.5} onChange={(v) => setClip(selClip.id, { out: v, length: v })} show={`${selClip.out.toFixed(1)}s`} />;
    } else if (panel === "volume") {
      if (sel?.kind === "clip" && selClip) panelBody = <Slider label="Clip sound" value={Math.round(selClip.volume * 100)} min={0} max={200} onChange={(v) => setClip(selClip.id, { volume: v / 100 })} show={`${Math.round(selClip.volume * 100)}%`} />;
      else if (sel?.kind === "song" && p.song)
        panelBody = <Slider label="Music" value={Math.round(p.song.volume * 100)} min={0} max={200} onChange={(v) => update((q) => ({ ...q, song: q.song ? { ...q.song, volume: v / 100 } : null }))} show={`${Math.round(p.song.volume * 100)}%`} />;
    }
  }

  const stage = p ? (
    <div
      ref={stageRef}
      onPointerDown={() => sel?.kind === "text" && select(null)}
      className="relative overflow-hidden bg-black shadow-2xl"
      style={{ width: stageW, aspectRatio: `${size.w} / ${size.h}`, containerType: "inline-size" }}
    >
      <div className="absolute inset-0" style={mediaStyle}>
        {clip?.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- a photo clip
          <img src={srcUrl(clip.source)} alt="" draggable={false} className="absolute inset-0 size-full object-cover" style={{ filter }} />
        ) : null}
        <video ref={videoRef} playsInline preload="auto" className={`absolute inset-0 size-full object-cover ${clip?.type === "video" ? "" : "invisible"}`} style={{ filter }} />
      </div>
      {tr && prevFrame && (tr.kind === "dissolve" || tr.kind === "slide") ? (
        // eslint-disable-next-line @next/next/no-img-element -- the last frame of the clip before, for the transition
        <img
          src={prevFrame}
          alt=""
          className="absolute inset-0 size-full object-cover"
          style={{ filter, opacity: tr.kind === "dissolve" ? 1 - tr.k : 1, transform: tr.kind === "slide" ? `translateX(${-(1 - (1 - tr.k) ** 3) * 100}%)` : undefined }}
        />
      ) : null}
      {tr?.kind === "fade" ? <div className="absolute inset-0 bg-black" style={{ opacity: tr.k < 0.5 ? tr.k * 2 : (1 - tr.k) * 2 }} /> : null}
      {tr?.kind === "flash" ? <div className="absolute inset-0 bg-white" style={{ opacity: (1 - tr.k) ** 2 }} /> : null}
      {p.texts
        .filter((x) => t >= x.start && t < x.end)
        .map((x) => {
          // Paused, words show whole; playing, they move as they will in the video.
          const now = playing ? textAt(x, t) : { alpha: 1, scale: 1, dy: 0, text: x.text };
          const on = sel?.kind === "text" && sel.id === x.id;
          return (
            <div
              key={x.id}
              onPointerDown={(e) => dragText(e, x, "move")}
              onDoubleClick={() => setPanel("text")}
              className="absolute max-w-[86%] cursor-move touch-none select-none text-center"
              style={{ left: `${x.x * 100}%`, top: `${(x.y + now.dy) * 100}%`, transform: `translate(-50%, -50%) scale(${now.scale})`, width: "max-content", opacity: now.alpha }}
            >
              <span style={textCss(x)} className="whitespace-pre-wrap">
                {now.text || (on ? "Enter text" : "")}
              </span>
              {on ? (
                <>
                  <span className="pointer-events-none absolute -inset-2 rounded border-2 border-white" />
                  <button type="button" aria-label="Delete text" onPointerDown={(e) => e.stopPropagation()} onClick={removeSelected} className="absolute -left-4 -top-4 flex size-6 items-center justify-center rounded-full bg-white text-gray-950 shadow">
                    <Icon.Close className="size-3.5" />
                  </button>
                  <button type="button" aria-label="Edit text" onPointerDown={(e) => e.stopPropagation()} onClick={() => setPanel("text")} className="absolute -right-4 -top-4 flex size-6 items-center justify-center rounded-full bg-white text-gray-950 shadow">
                    <Icon.Edit className="size-3.5" />
                  </button>
                  <span onPointerDown={(e) => dragText(e, x, "size")} aria-label="Resize" className="absolute -bottom-4 -right-4 flex size-6 cursor-nwse-resize items-center justify-center rounded-full bg-white text-gray-950 shadow">
                    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
                      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                    </svg>
                  </span>
                </>
              ) : null}
            </div>
          );
        })}
      {p.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- the business's logo
        <img
          src={srcUrl(p.logo.source)}
          alt=""
          className="pointer-events-none absolute opacity-90"
          style={{ width: `${p.logo.size * 100}%`, [p.logo.corner.startsWith("t") ? "top" : "bottom"]: "4cqw", [p.logo.corner.endsWith("l") ? "left" : "right"]: "4cqw" }}
        />
      ) : null}
    </div>
  ) : null;

  const body = (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0b0b0f] text-white select-none">
      <header className="flex h-14 shrink-0 items-center gap-2 px-3">
        <button type="button" onClick={onClose} disabled={progress !== null} aria-label="Close" className="flex size-10 items-center justify-center rounded-full hover:bg-white/10">
          <Icon.Close />
        </button>
        <span className="flex-1" />
        <span className="hidden rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/70 sm:inline tnum">
          {size.w}×{size.h}
        </span>
        <button
          type="button"
          onClick={() => void done()}
          disabled={!p || progress !== null || !!busy || total <= 0}
          className="flex h-9 items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-600 disabled:opacity-40"
        >
          {!p && !error ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
          Export
        </button>
      </header>

      {!p ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-sm text-white/60">
          {error ? null : <span className="size-10 animate-spin rounded-full border-[3px] border-white/10 border-t-brand-500" />}
          {error ?? "Opening your photos and videos…"}
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1">
            <div ref={areaRef} className="flex min-w-0 flex-1 items-center justify-center">
              {stage}
            </div>
            {/* The panel: a side column on a computer, a sheet over the timeline on a phone. */}
            <aside
              className={`flex-col border-white/10 bg-[#17171c] max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:max-h-[52dvh] max-lg:rounded-t-3xl max-lg:shadow-[0_-12px_40px_rgba(0,0,0,0.5)] lg:flex lg:w-80 lg:border-l ${panelBody ? "flex" : "hidden"}`}
            >
              {panelBody ? (
                <>
                  <div className="flex items-center justify-between px-4 pb-2 pt-3">
                    <p className="text-sm font-semibold">{panel ? PANEL_TITLE[panel] : ""}</p>
                    <button type="button" onClick={() => setPanel(null)} aria-label="Done" className="flex size-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/15">
                      <Icon.Check className="size-4" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{panelBody}</div>
                </>
              ) : (
                <p className="m-auto max-w-52 text-center text-xs text-white/40">Pick a tool below, or tap a clip, text or music on the timeline.</p>
              )}
            </aside>
          </div>

          <div className="flex h-11 shrink-0 items-center gap-2 px-3">
            <span className="w-28 text-xs text-white/60 tnum">
              <span className="text-white">{time1(Math.min(t, total))}</span> / {time(total)}
            </span>
            <span className="flex flex-1 items-center justify-center">
              <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying(!playing)} className="flex size-10 items-center justify-center rounded-full hover:bg-white/10">
                {playing ? <Icon.Pause className="size-6" /> : <Icon.Play className="size-6" />}
              </button>
            </span>
            <span className="flex w-28 items-center justify-end gap-1">
              <button type="button" aria-label="Undo" onClick={() => undo()} disabled={!hist.undo} className="flex size-9 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30">
                <Icon.Undo />
              </button>
              <button type="button" aria-label="Redo" onClick={() => undo(true)} disabled={!hist.redo} className="flex size-9 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30">
                <Icon.Redo />
              </button>
            </span>
          </div>

          <div className="relative shrink-0 border-t border-white/5 bg-[#111116] pb-1 pt-1">
            <Timeline
              p={p}
              t={t}
              pps={pps}
              onZoom={setPps}
              sel={sel}
              onSelect={select}
              onSeek={(to) => {
                setPlaying(false);
                seek(to);
              }}
              onClip={setClip}
              onText={setText}
              onSong={(start) => update((q) => ({ ...q, song: q.song ? { ...q.song, start } : null }))}
              onAddClips={(f) => void addClips(f)}
              onAddText={addText}
              onAddAudio={() => {
                select(null);
                setPanel("audio");
              }}
              onMuteAll={() => {
                const allMuted = p.clips.every((c) => c.volume === 0 || !c.hasSound);
                update((q) => ({ ...q, clips: q.clips.map((c) => ({ ...c, volume: allMuted ? 1 : 0 })) }));
              }}
            />
            <div className="absolute right-2 top-1 hidden gap-1 lg:flex">
              <button type="button" aria-label="Zoom out" onClick={() => setPps(Math.max(6, pps / 1.5))} className="flex size-7 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white">
                <Icon.ZoomOut className="size-4" />
              </button>
              <button type="button" aria-label="Zoom in" onClick={() => setPps(Math.min(400, pps * 1.5))} className="flex size-7 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white">
                <Icon.ZoomIn className="size-4" />
              </button>
            </div>
          </div>

          {busy || error ? (
            <p className={`shrink-0 px-4 py-1 text-center text-xs ${error ? "text-error-400" : "text-white/60"}`}>
              {error ?? busy}
              {error ? (
                <button type="button" onClick={() => setError(null)} className="ml-2 underline">
                  OK
                </button>
              ) : null}
            </p>
          ) : null}

          <nav className="flex h-[4.5rem] shrink-0 items-center border-t border-white/5 bg-[#0b0b0f] px-1 pb-[env(safe-area-inset-bottom)]">
            {sel ? (
              <button type="button" onClick={() => select(null)} aria-label="Back" className="flex h-full w-11 shrink-0 items-center justify-center border-r border-white/10 text-white/70 hover:text-white">
                <Icon.Back />
              </button>
            ) : null}
            <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto px-1 lg:justify-center" style={{ scrollbarWidth: "none" }}>{tools}</div>
          </nav>
        </>
      )}

      {progress !== null ? <Exporting progress={progress} /> : null}
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(body, document.body);
}

function Exporting({ progress }: { progress: number }) {
  const pct = Math.round(progress * 100);
  const r = 54;
  const c = 2 * Math.PI * r;
  const stage = progress < 0.06 ? "Mixing the sound" : progress < 0.85 ? "Making the video" : "Uploading";
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-black/85 backdrop-blur-sm">
      <div className="relative size-36">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-brand-500)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} className="transition-[stroke-dashoffset] duration-300" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-3xl font-bold tnum">{pct}%</span>
      </div>
      <div className="space-y-1 text-center">
        <p className="text-base font-semibold">{stage}…</p>
        <p className="text-xs text-white/50">Keep this screen open until it finishes.</p>
      </div>
    </div>
  );
}
