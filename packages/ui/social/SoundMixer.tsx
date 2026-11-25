"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@repo/ui/Button";
import { ProgressBar } from "@repo/ui/ProgressBar";
import { amingSongs } from "@repo/lib/social/actions";
import type { PostMedia, Song } from "@repo/lib/social/core";

import { readableUrl } from "./editor/model";
import { uploadMedia } from "./MediaPicker";

const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
/** A song, or a video whose sound becomes the song (owner, 2026-11-25: "extract from video some sounds"). */
const AUDIO = "audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.aac,.wav,video/mp4,video/quicktime,.mp4,.mov";

const Note = ({ className = "size-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </svg>
);

interface Chosen {
  file: File;
  name: string;
  /** From the Aming music library: counted for the artist when the post goes out. */
  songId?: string;
}

// A song put into the post before it leaves (./mixSound.ts): one from the
// Aming music library (licensed from the artists) or the business's own file.
// On a video, the first video gets it; photos become one slideshow video.
export function SoundMixer({
  media,
  button,
  open,
  onOpen,
  onChange,
  onBusy,
}: {
  media: PostMedia[];
  /** Show its own "♪ Song" button (with TikTok picked, the music strip's tile opens it instead). */
  button: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  onChange: (next: PostMedia[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [length, setLength] = useState(0);
  const [start, setStart] = useState(0);
  const [keepOwn, setKeepOwn] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = useRef<number | undefined>(undefined);

  const video = media.find((m) => m.type === "video");
  const photos = media.filter((m) => m.type === "image");

  useEffect(() => () => audio.current?.pause(), []);
  useEffect(() => {
    if (open && !songs) void amingSongs().then((res) => setSongs(res.ok ? res.data : []));
  }, [open, songs]);

  function play(key: string, src: string, from: number) {
    audio.current?.pause();
    window.clearTimeout(stop.current);
    if (playing === key) return setPlaying(null);
    audio.current = new Audio(src);
    audio.current.currentTime = from;
    void audio.current.play();
    setPlaying(key);
    stop.current = window.setTimeout(() => {
      audio.current?.pause();
      setPlaying(null);
    }, 10_000);
  }

  async function take(c: Chosen, from: number) {
    setError(null);
    setDone(null);
    try {
      const { songLength } = await import("./mixSound");
      setLength(await songLength(c.file));
      setChosen(c);
      setStart(from);
    } catch {
      setError("That sound won't open. Use an MP3, M4A, WAV or an MP4/MOV video.");
    }
  }

  async function pickSong(s: Song) {
    setLoading(s.id);
    try {
      const res = await fetch(readableUrl(s.audioUrl));
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      await take({ file: new File([blob], `${s.title}.mp3`, { type: blob.type }), name: `${s.title} · ${s.artist}`, songId: s.id }, s.hookAt);
    } catch {
      setError("That song wouldn't load. Try again.");
    } finally {
      setLoading(null);
    }
  }

  async function make() {
    if (!chosen) return;
    audio.current?.pause();
    setPlaying(null);
    setError(null);
    setProgress(0);
    onBusy(true);
    try {
      const mix = await import("./mixSound");
      const song = { file: chosen.file, start, keepOwn };
      const out = video ? await mix.songOnVideo(video.url, song, (p) => setProgress(p * 0.7)) : await mix.songOnPhotos(photos.map((p) => p.url), song, (p) => setProgress(p * 0.7));
      const up = await uploadMedia(out, (p) => setProgress(0.7 + p * 0.3));
      if (!up.ok) throw new Error(up.error);
      const made: PostMedia = chosen.songId ? { ...up.media, songId: chosen.songId } : up.media;
      onChange(video ? media.map((m) => (m === video ? made : m)) : [...media.filter((m) => m.type !== "image"), made]);
      setDone(chosen.name);
      setChosen(null);
      onOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sound couldn't be added. Try again.");
    } finally {
      setProgress(null);
      onBusy(false);
    }
  }

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = songs?.filter((s) => words.every((w) => `${s.title} ${s.artist}`.toLowerCase().includes(w)));

  return (
    <div className="space-y-3">
      <input
        ref={picker}
        type="file"
        accept={AUDIO}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void take({ file: f, name: f.name }, 0);
          e.target.value = "";
        }}
      />
      {!open && !chosen ? (
        <div className={`items-center gap-3 ${button || done ? "flex" : "hidden"}`}>
          {button ? (
            <button
              type="button"
              onClick={() => onOpen(true)}
              className="inline-flex min-h-9 items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-4 text-sm font-semibold text-white shadow-theme-xs"
            >
              <Note className="size-4" /> Song
            </button>
          ) : null}
          {done ? <span className="min-w-0 truncate text-xs font-medium text-success-600">✓ {done}</span> : null}
        </div>
      ) : null}

      {open && !chosen ? (
        <div className="space-y-2 rounded-2xl border border-border bg-background p-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm font-semibold">Aming music</p>
            <button type="button" aria-label="Close" onClick={() => onOpen(false)} className="text-muted">
              ✕
            </button>
          </div>
          {songs && songs.length > 6 ? (
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${songs.length} songs`} className="h-10 w-full rounded-full border border-border bg-surface px-4 text-sm outline-none focus:border-brand-500" />
          ) : null}
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 py-2">
            <button
              type="button"
              onClick={() => picker.current?.click()}
              className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand-400 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10"
            >
              <span className="text-lg leading-none">＋</span>
              Song or video
            </button>
            {!songs ? [0, 1, 2].map((i) => <span key={i} className="size-20 shrink-0 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />) : null}
            {shown?.map((s) => (
              <div key={s.id} className="w-20 shrink-0">
                <button type="button" disabled={loading !== null} onClick={() => void pickSong(s)} aria-label={`${s.title} by ${s.artist}`} className="relative block size-20 overflow-hidden rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white hover:opacity-90 disabled:opacity-60">
                  {s.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the song's cover
                    <img src={s.coverUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center">
                      <Note />
                    </span>
                  )}
                  {loading === s.id ? <span className="absolute inset-0 animate-pulse bg-black/40" /> : null}
                </button>
                <div className="mt-1 flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={playing === s.id ? "Stop" : "Play"}
                    onClick={() => play(s.id, s.audioUrl, s.hookAt)}
                    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-black/80 text-[9px] text-white dark:bg-white/20"
                  >
                    {playing === s.id ? "■" : "▶"}
                  </button>
                  <p className="min-w-0 truncate text-[11px] font-medium" title={`${s.title} · ${s.artist}`}>
                    {s.title}
                  </p>
                </div>
                <p className="truncate text-[10px] text-muted">{s.artist}</p>
              </div>
            ))}
            {shown?.length === 0 && songs?.length ? <p className="flex h-20 shrink-0 items-center px-2 text-xs text-muted">No song called “{q}”</p> : null}
          </div>
        </div>
      ) : null}

      {chosen ? (
        <div className="space-y-3 rounded-2xl border border-border bg-background p-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={playing === "chosen" ? "Stop" : "Play"}
              onClick={() => play("chosen", URL.createObjectURL(chosen.file), start)}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm text-white"
            >
              {playing === "chosen" ? "■" : "▶"}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{chosen.name}</p>
              <p className="text-xs text-muted tnum">
                from {time(start)} · {video ? "on your video" : photos.length ? `${photos.length} photos → video` : "add photos or a video"}
              </p>
            </div>
            <button type="button" aria-label="Pick another" onClick={() => setChosen(null)} className="text-muted">
              ✕
            </button>
          </div>
          {length > 5 ? <input type="range" min={0} max={Math.floor(length - 1)} step={1} value={start} onChange={(e) => setStart(Number(e.target.value))} aria-label="Start the song at" className="w-full accent-brand-500" /> : null}
          {video ? (
            <label className="flex items-center gap-2 text-xs font-medium">
              <input type="checkbox" checked={keepOwn} onChange={(e) => setKeepOwn(e.target.checked)} className="accent-brand-500" />
              Keep the video&apos;s own sound under it
            </label>
          ) : null}
          {progress !== null ? (
            <ProgressBar value={Math.round(progress * 100)} max={100} label="Adding the song" showValue="percent" />
          ) : (
            <Button type="button" variant="primary" className="min-h-9 w-full" disabled={!video && !photos.length} onClick={() => void make()}>
              {video ? "Add to video" : photos.length ? "Add to photos" : "Add photos or a video first"}
            </Button>
          )}
        </div>
      ) : null}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
    </div>
  );
}
