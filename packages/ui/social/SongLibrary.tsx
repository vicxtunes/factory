"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { DateInput } from "@repo/ui/DateTimeInputs";
import { Field, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { UploadRow } from "@repo/ui/UploadRow";
import { createSongUpload, saveSong } from "@repo/lib/social/actions";
import type { BossSong } from "@repo/lib/social/core";
import { putToSignedUrl } from "@repo/lib/storage/xhr-upload";

const BUCKET = "social-songs";
const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

const Note = () => (
  <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </svg>
);

async function upload(file: File, onProgress: (p: number) => void): Promise<string> {
  const session = await createSongUpload(file.name);
  if (!session.ok) throw new Error(session.error);
  const sent = await putToSignedUrl(BUCKET, session.path, session.token, file, onProgress);
  if (!sent.ok) throw new Error(sent.error);
  return session.path;
}

// The boss's Aming music library (Studios): songs licensed from artists for
// businesses' posts, as cover cards with how often each went out. Add and
// change in a pop-up.
export function SongLibrary({ songs }: { songs: BossSong[] }) {
  const [open, setOpen] = useState<BossSong | "new" | null>(null);
  const ended = (s: BossSong) => !!s.licenceUntil && s.licenceUntil < today();

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <li>
          <button
            type="button"
            onClick={() => setOpen("new")}
            className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-400 text-sm font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10"
          >
            <Note />
            Add song
          </button>
        </li>
        {songs.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setOpen(s)} className={`w-full text-left ${s.hidden || ended(s) ? "opacity-50" : ""}`}>
              <span className="relative block aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-theme-xs">
                {s.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the song's cover
                  <img src={s.coverUrl} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center">
                    <Note />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-8 text-white">
                  <span className="text-2xl font-bold leading-none tnum">{s.uses30}</span>
                  <span className="text-[11px] font-medium">30 days · {s.uses} all</span>
                </span>
                {s.hidden || ended(s) ? <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 text-[11px] font-semibold">{s.hidden ? "Hidden" : "Licence ended"}</span> : null}
              </span>
              <span className="mt-1.5 block truncate text-sm font-semibold">{s.title}</span>
              <span className="block truncate text-xs text-muted">{s.artist}</span>
            </button>
          </li>
        ))}
      </ul>
      <FormSheet open={open !== null} onClose={() => setOpen(null)} title={open === "new" ? "Add a song" : (open?.title ?? "")}>
        {open ? <SongForm key={open === "new" ? "new" : open.id} song={open === "new" ? null : open} onDone={() => setOpen(null)} /> : null}
      </FormSheet>
    </div>
  );
}

function SongForm({ song, onDone }: { song: BossSong | null; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(song?.title ?? "");
  const [artist, setArtist] = useState(song?.artist ?? "");
  const [audio, setAudio] = useState<{ path: string; url: string; seconds: number | null } | null>(song ? { path: song.audioPath, url: song.audioUrl, seconds: song.seconds } : null);
  const [cover, setCover] = useState<{ path: string; url: string } | null>(song?.coverPath && song.coverUrl ? { path: song.coverPath, url: song.coverUrl } : null);
  const [hookAt, setHookAt] = useState(song?.hookAt ?? 0);
  const [until, setUntil] = useState(song?.licenceUntil ?? "");
  const [hidden, setHidden] = useState(song?.hidden ?? false);
  const [progress, setProgress] = useState<{ audio: number | null; cover: number | null }>({ audio: null, cover: null });
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const player = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => player.current?.pause(), []);

  async function addAudio(file: File) {
    setError(null);
    setProgress((p) => ({ ...p, audio: 0 }));
    try {
      const { songLength } = await import("./mixSound");
      const seconds = await songLength(file).catch(() => null);
      const path = await upload(file, (n) => setProgress((p) => ({ ...p, audio: n })));
      setAudio({ path, url: URL.createObjectURL(file), seconds });
      setHookAt(0);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed.");
    } finally {
      setProgress((p) => ({ ...p, audio: null }));
    }
  }

  async function addCover(file: File) {
    setError(null);
    setProgress((p) => ({ ...p, cover: 0 }));
    try {
      const path = await upload(file, (n) => setProgress((p) => ({ ...p, cover: n })));
      setCover({ path, url: URL.createObjectURL(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload failed.");
    } finally {
      setProgress((p) => ({ ...p, cover: null }));
    }
  }

  function listen() {
    player.current?.pause();
    if (playing || !audio) return setPlaying(false);
    player.current = new Audio(audio.url);
    player.current.currentTime = hookAt;
    player.current.onended = () => setPlaying(false);
    void player.current.play();
    setPlaying(true);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await saveSong(song?.id ?? null, { title, artist, audioPath: audio?.path ?? "", coverPath: cover?.path ?? null, seconds: audio?.seconds ?? null, hookAt, licenceUntil: until || null, hidden });
      if (!res.ok) return setError(res.error);
      router.refresh();
      onDone();
    });
  }

  const busy = progress.audio !== null || progress.cover !== null;

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex gap-4">
        <label className="relative size-28 shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- the cover just picked
            <img src={cover.url} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-1 text-xs font-semibold">
              <Note />
              {progress.cover !== null ? `${Math.round(progress.cover * 100)}%` : "Cover"}
            </span>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && void addCover(e.target.files[0])} />
        </label>
        <div className="min-w-0 flex-1 space-y-3">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Title" required aria-label="Title" />
          <TextInput value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={200} placeholder="Artist" required aria-label="Artist" />
        </div>
      </div>
      {audio ? (
        <div className="space-y-2 rounded-2xl border border-border bg-background p-3">
          <div className="flex items-center gap-3">
            <button type="button" aria-label={playing ? "Stop" : "Play"} onClick={listen} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm text-white">
              {playing ? "■" : "▶"}
            </button>
            <p className="flex-1 text-sm">
              Catchy part from <span className="font-semibold tnum">{time(hookAt)}</span>
              {audio.seconds ? <span className="text-muted tnum"> / {time(audio.seconds)}</span> : null}
            </p>
            <label className="cursor-pointer text-xs font-semibold text-brand-600">
              Replace
              <input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.aac,.wav" className="sr-only" onChange={(e) => e.target.files?.[0] && void addAudio(e.target.files[0])} />
            </label>
          </div>
          {audio.seconds && audio.seconds > 5 ? (
            <input type="range" min={0} max={Math.floor(audio.seconds - 1)} value={hookAt} onChange={(e) => setHookAt(Number(e.target.value))} aria-label="Catchy part starts at" className="w-full accent-brand-500" />
          ) : null}
        </div>
      ) : (
        <UploadRow label="Song" hint="MP3, M4A or WAV · up to 30 MB" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.aac,.wav" disabled={busy} progress={progress.audio} onFiles={(f) => f[0] && void addAudio(f[0])} />
      )}
      <Field label="Licence ends" hint="Leave empty if it doesn't. Businesses stop seeing the song after this day.">
        <DateInput value={until} onChange={setUntil} placeholder="No end" />
      </Field>
      {song ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="size-4" />
          Hide from businesses
        </label>
      ) : null}
      {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
      <Button type="submit" variant="primary" className="w-full" loading={pending} disabled={pending || busy || !audio}>
        {song ? "Save" : "Add to the library"}
      </Button>
    </form>
  );
}
