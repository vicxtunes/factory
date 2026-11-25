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
  /** 0 to 2; 0 mutes it. */
  volume: number;
  /** How this clip comes in after the one before (the first clip's is ignored). */
  transition: Transition;
}

export type Transition = "none" | "fade" | "dissolve" | "flash" | "zoom" | "slide";
export const TRANSITIONS: { key: Transition; label: string }[] = [
  { key: "none", label: "None" },
  { key: "fade", label: "Fade" },
  { key: "dissolve", label: "Dissolve" },
  { key: "flash", label: "Flash" },
  { key: "zoom", label: "Zoom" },
  { key: "slide", label: "Slide" },
];
/** Seconds a transition takes, at the start of the clip coming in. */
export const TRANSITION_SECONDS = 0.5;

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

/** Brightness, contrast and saturation, each -50 to 50 (0 leaves it). */
export interface Adjust {
  brightness: number;
  contrast: number;
  saturation: number;
}

/** The look and the adjustments as one CSS filter, for the preview and the export alike. */
export function filterCss(p: Project): string {
  const a = p.adjust;
  const parts = [lookCss(p.look), a.brightness ? `brightness(${1 + a.brightness / 100})` : "", a.contrast ? `contrast(${1 + a.contrast / 100})` : "", a.saturation ? `saturate(${1 + a.saturation / 50})` : ""].filter((x) => x && x !== "none");
  return parts.length ? parts.join(" ") : "none";
}

export type TextStyle = "plain" | "box" | "glow" | "shadow" | "label";
export const TEXT_STYLES: { key: TextStyle; label: string }[] = [
  { key: "plain", label: "Outline" },
  { key: "box", label: "Box" },
  { key: "label", label: "Label" },
  { key: "shadow", label: "Shadow" },
  { key: "glow", label: "Neon" },
];

export type Font = "sans" | "serif" | "condensed" | "mono";
export const FONTS: { key: Font; label: string; css: string; weight: number }[] = [
  { key: "sans", label: "Bold", css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', weight: 800 },
  { key: "condensed", label: "Poster", css: 'Impact, "Arial Narrow Bold", "Roboto Condensed", sans-serif', weight: 400 },
  { key: "serif", label: "Classic", css: 'Georgia, "Times New Roman", serif', weight: 700 },
  { key: "mono", label: "Type", css: 'ui-monospace, Menlo, Consolas, monospace', weight: 700 },
];
export const fontCss = (f: Font) => FONTS.find((x) => x.key === f) ?? FONTS[0];

export type TextAnim = "none" | "pop" | "fade" | "rise" | "type";
export const TEXT_ANIMS: { key: TextAnim; label: string }[] = [
  { key: "none", label: "None" },
  { key: "pop", label: "Pop" },
  { key: "fade", label: "Fade" },
  { key: "rise", label: "Rise" },
  { key: "type", label: "Typewriter" },
];

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
  font: Font;
  anim: TextAnim;
}

/** How words look at `t` while they come in and go out: the same for the preview and the export. */
export function textAt(item: TextItem, t: number): { alpha: number; scale: number; dy: number; text: string } {
  const local = t - item.start;
  const left = item.end - t;
  const k = Math.min(1, Math.max(0, local / 0.4));
  const out = item.anim === "none" ? 1 : Math.min(1, Math.max(0, left / 0.25));
  const back = (x: number) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);
  switch (item.anim) {
    case "pop":
      return { alpha: Math.min(1, k * 2) * out, scale: 0.5 + 0.5 * back(k), dy: 0, text: item.text };
    case "fade":
      return { alpha: k * out, scale: 1, dy: 0, text: item.text };
    case "rise":
      return { alpha: k * out, scale: 1, dy: 0.05 * (1 - k) * (1 - k), text: item.text };
    case "type": {
      const n = item.text.length;
      const shown = Math.ceil(n * Math.min(1, local / Math.min(2, Math.max(0.5, n * 0.06))));
      return { alpha: out, scale: 1, dy: 0, text: item.text.slice(0, shown) };
    }
    default:
      return { alpha: 1, scale: 1, dy: 0, text: item.text };
  }
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
  /** Where in the song the video starts, seconds (below 0: the song comes in that late). */
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
  adjust: Adjust;
}

/** A transition in progress at `t`: which, and how far through (0 to 1). */
export function transitionAt(p: Project, t: number): { kind: Transition; k: number; index: number } | null {
  let start = 0;
  for (let i = 0; i < p.clips.length; i++) {
    const c = p.clips[i];
    if (t < start + used(c)) {
      const kind = c.transition;
      if (i === 0 || kind === "none" || t - start >= TRANSITION_SECONDS) return null;
      return { kind, k: (t - start) / TRANSITION_SECONDS, index: i };
    }
    start += used(c);
  }
  return null;
}

/** Where each clip starts on the timeline. */
export const starts = (p: Project) => p.clips.reduce<number[]>((a, c, i) => (a.push(i ? a[i - 1] + used(p.clips[i - 1]) : 0), a), []);

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

/**
 * The same file at its own address, for reading in code (fetch, the video
 * reader, a canvas). The app's offline cache (packages/ui/pwa/sw.ts) keeps
 * the copy a thumbnail loaded, which code may not read ("fetch failed" when
 * opening the editor, owner 2026-11-25), so code asks for its own copy.
 */
export const readableUrl = (u: string) => (u.startsWith("blob:") ? u : `${u}${u.includes("?") ? "&" : "?"}read=1`);

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Dark or light letters on a coloured label, whichever reads. */
export function labelInk(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? "#111111" : "#ffffff";
}
