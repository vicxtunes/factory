"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@repo/ui/Button";
import { ProgressBar } from "@repo/ui/ProgressBar";
import type { PostMedia } from "@repo/lib/social/core";

import { uploadMedia } from "./MediaPicker";

const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// "My sound": the business's own song put into the post before it leaves
// (./mixSound.ts). On a video, the first video gets it; photos become one
// slideshow video with it.
/** The file box's id: the TikTok music strip's "My sound" tile opens it too. */
export const MY_SOUND_INPUT = "social-my-sound";

export function SoundMixer({ media, button, onChange, onBusy }: { media: PostMedia[]; button: boolean; onChange: (next: PostMedia[]) => void; onBusy: (busy: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [length, setLength] = useState(0);
  const [start, setStart] = useState(0);
  const [keepOwn, setKeepOwn] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = useRef<number | undefined>(undefined);

  const video = media.find((m) => m.type === "video");
  const photos = media.filter((m) => m.type === "image");

  useEffect(() => () => audio.current?.pause(), []);

  async function choose(f: File | undefined) {
    if (!f) return;
    setError(null);
    setDone(null);
    try {
      const { songLength } = await import("./mixSound");
      setLength(await songLength(f));
      setFile(f);
      setStart(0);
    } catch {
      setError("That sound won't open. Use an MP3, M4A or WAV.");
    }
  }

  function listen() {
    audio.current?.pause();
    window.clearTimeout(stop.current);
    if (playing || !file) return setPlaying(false);
    audio.current = new Audio(URL.createObjectURL(file));
    audio.current.currentTime = start;
    void audio.current.play();
    setPlaying(true);
    stop.current = window.setTimeout(() => {
      audio.current?.pause();
      setPlaying(false);
    }, 10_000);
  }

  async function make() {
    if (!file) return;
    audio.current?.pause();
    setPlaying(false);
    setError(null);
    setProgress(0);
    onBusy(true);
    try {
      const mix = await import("./mixSound");
      const song = { file, start, keepOwn };
      const out = video ? await mix.songOnVideo(video.url, song, (p) => setProgress(p * 0.7)) : await mix.songOnPhotos(photos.map((p) => p.url), song, (p) => setProgress(p * 0.7));
      const up = await uploadMedia(out, (p) => setProgress(0.7 + p * 0.3));
      if (!up.ok) throw new Error(up.error);
      onChange(video ? media.map((m) => (m === video ? up.media : m)) : [...media.filter((m) => m.type !== "image"), up.media]);
      setDone(file.name);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sound couldn't be added. Try again.");
    } finally {
      setProgress(null);
      onBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input ref={picker} id={MY_SOUND_INPUT} type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.aac,.wav" hidden onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }} />
      {!file ? (
        <div className={`items-center gap-3 ${button || done ? "flex" : "hidden"}`}>
          <button
            type="button"
            hidden={!button}
            onClick={() => picker.current?.click()}
            className="inline-flex min-h-9 items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-4 text-sm font-semibold text-white shadow-theme-xs"
          >
            ♪ My sound
          </button>
          {done ? <span className="min-w-0 truncate text-xs font-medium text-success-600">✓ {done}</span> : null}
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-border bg-background p-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={playing ? "Stop" : "Play"}
              onClick={listen}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm text-white"
            >
              {playing ? "■" : "▶"}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{file.name}</p>
              <p className="text-xs text-muted tnum">
                from {time(start)} · {video ? "on your video" : photos.length ? `${photos.length} photos → video` : "add photos or a video"}
              </p>
            </div>
            <button type="button" aria-label="Remove sound" onClick={() => setFile(null)} className="text-muted">
              ✕
            </button>
          </div>
          {length > 5 ? (
            <input type="range" min={0} max={Math.floor(length - 1)} step={1} value={start} onChange={(e) => setStart(Number(e.target.value))} aria-label="Start the song at" className="w-full accent-brand-500" />
          ) : null}
          {video ? (
            <label className="flex items-center gap-2 text-xs font-medium">
              <input type="checkbox" checked={keepOwn} onChange={(e) => setKeepOwn(e.target.checked)} className="accent-brand-500" />
              Keep the video&apos;s own sound under it
            </label>
          ) : null}
          {progress !== null ? (
            <ProgressBar value={Math.round(progress * 100)} max={100} label="Adding the sound" showValue="percent" />
          ) : (
            <Button type="button" variant="primary" className="min-h-9 w-full" disabled={!video && !photos.length} onClick={() => void make()}>
              {video ? "Add to video" : photos.length ? "Add to photos" : "Add photos or a video first"}
            </Button>
          )}
        </div>
      )}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
    </div>
  );
}
