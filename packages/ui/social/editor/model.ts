// The video editor's project (owner, 2026-11-25): clips joined in order, each
// trimmed, the frame size, a colour look, words on the video, the business's
// logo, and the sound (each clip's own, muted or turned down, plus a song).
// The preview (./VideoEditor.tsx) and the export (./render.ts) read the same
// project, so what they see is what goes out.

export type Source = { kind: "url"; url: string } | { kind: "file"; file: File };

export interface Clip {
  id: string;
  source: Source;
  type: "video" | "image";
  name: string;
  /** The whole clip, seconds (a photo: how long it shows). */
  length: number;
  /** The part used, seconds into the clip. */
  in: number;
  out: number;
  width: number;
  height: number;
  hasSound: boolean;
  /** 0 to 1.5; 0 mutes it. */
  volume: number;
}

export type Aspect = "original" | "9:16" | "1:1" | "4:5" | "16:9";

export const ASPECTS: { key: Aspect; label: string; for: string }[] = [
  { key: "original", label: "Original", for: "As filmed" },
  { key: "9:16", label: "9:16", for: "TikTok · Reels · Shorts" },
  { key: "4:5", label: "4:5", for: "Instagram feed" },
  { key: "1:1", label: "1:1", for: "Square" },
  { key: "16:9", label: "16:9", for: "YouTube · Facebook" },
];

export type Look = "none" | "warm" | "cool" | "vivid" | "bw" | "fade" | "film";

/** Each look as a CSS filter: the preview uses it on the video, the export on the canvas. */
export const LOOKS: { key: Look; label: string; css: string }[] = [
  { key: "none", label: "None", css: "none" },
  { key: "warm", label: "Warm", css: "sepia(0.25) saturate(1.3) brightness(1.03)" },
  { key: "cool", label: "Cool", css: "hue-rotate(-12deg) saturate(1.1) brightness(1.02)" },
  { key: "vivid", label: "Vivid", css: "saturate(1.6) contrast(1.1)" },
  { key: "bw", label: "B&W", css: "grayscale(1) contrast(1.15)" },
  { key: "fade", label: "Fade", css: "contrast(0.85) brightness(1.1) saturate(0.8)" },
  { key: "film", label: "Film", css: "sepia(0.35) contrast(1.15) saturate(0.9)" },
];
export const lookCss = (l: Look) => LOOKS.find((x) => x.key === l)?.css ?? "none";

export type TextStyle = "plain" | "box" | "glow";

export interface TextItem {
  id: string;
  text: string;
  /** On the finished video's timeline, seconds. */
  start: number;
  end: number;
  /** Centre, as a share of the frame (0 to 1). */
  x: number;
  y: number;
  /** Letter height as a share of the frame's width. */
  size: number;
  color: string;
  style: TextStyle;
}

export type Corner = "tl" | "tr" | "bl" | "br";

export interface Logo {
  source: Source;
  corner: Corner;
  /** Width as a share of the frame's width. */
  size: number;
}

export interface Song {
  file: File;
  name: string;
  /** Where in the song to start, seconds. */
  start: number;
  volume: number;
  length: number;
  /** From the Aming music library: counted for the artist. */
  songId?: string;
}

export interface Project {
  clips: Clip[];
  aspect: Aspect;
  look: Look;
  texts: TextItem[];
  logo: Logo | null;
  song: Song | null;
}

export const FPS = 30;

export const used = (c: Clip) => Math.max(0, c.out - c.in);
export const totalLength = (p: Project) => p.clips.reduce((s, c) => s + used(c), 0);

/** Which clip is playing at `t` on the timeline, and how far into the clip. */
export function at(p: Project, t: number): { index: number; clipTime: number; startsAt: number } | null {
  let start = 0;
  for (let i = 0; i < p.clips.length; i++) {
    const c = p.clips[i];
    if (t < start + used(c) || i === p.clips.length - 1) return { index: i, clipTime: c.in + Math.min(used(c), Math.max(0, t - start)), startsAt: start };
    start += used(c);
  }
  return null;
}

/** The finished video's size: 1080 on the short side (1920 long at most), even numbers. */
export function frameSize(p: Project): { w: number; h: number } {
  const ratio: Record<Exclude<Aspect, "original">, number> = { "9:16": 9 / 16, "1:1": 1, "4:5": 4 / 5, "16:9": 16 / 9 };
  const first = p.clips[0];
  const r = p.aspect === "original" ? (first ? first.width / first.height : 9 / 16) : ratio[p.aspect];
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  if (r >= 1) {
    const w = Math.min(1920, Math.round(1080 * r));
    return { w: even(w), h: even(w / r) };
  }
  const h = Math.min(1920, Math.round(1080 / r));
  return { w: even(h * r), h: even(h) };
}

const fileUrls = new WeakMap<File, string>();
/** A URL the browser can play or show (one per file, kept). */
export function srcUrl(s: Source): string {
  if (s.kind === "url") return s.url;
  let u = fileUrls.get(s.file);
  if (!u) fileUrls.set(s.file, (u = URL.createObjectURL(s.file)));
  return u;
}

export const newId = () => Math.random().toString(36).slice(2, 10);
