// What the timeline shows: a strip of frames for each clip and the shape of
// its sound, and the song's. Read once per file in the browser and kept.

import { readableUrl, srcUrl, type Source } from "./model";

/** Peaks per second of sound in a wave. */
export const PEAKS_PER_SECOND = 40;

// Mediabunny loads only once the editor reads a file.
async function inputOf(s: Source) {
  const { ALL_FORMATS, BlobSource, Input, UrlSource } = await import("mediabunny");
  return new Input({ source: s.kind === "url" ? new UrlSource(readableUrl(s.url)) : new BlobSource(s.file), formats: ALL_FORMATS });
}

function toUrl(cv: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  const blob = "convertToBlob" in cv ? cv.convertToBlob({ type: "image/jpeg", quality: 0.7 }) : new Promise<Blob>((ok, fail) => cv.toBlob((b) => (b ? ok(b) : fail(new Error("no frame"))), "image/jpeg", 0.7));
  return blob.then((b) => URL.createObjectURL(b));
}

export interface Strip {
  /** Seconds into the clip of each frame. */
  at: number[];
  urls: string[];
}

const strips = new WeakMap<Source, Promise<Strip>>();
/** About one small frame a second (at most 60) across a whole video; a photo is itself. */
export function strip(source: Source, type: "video" | "image", length: number): Promise<Strip> {
  let s = strips.get(source);
  if (!s) {
    s =
      type === "image"
        ? Promise.resolve({ at: [0], urls: [srcUrl(source)] })
        : (async () => {
            const { CanvasSink } = await import("mediabunny");
            const input = await inputOf(source);
            try {
              const track = await input.getPrimaryVideoTrack();
              if (!track) return { at: [], urls: [] };
              const n = Math.max(2, Math.min(60, Math.ceil(length)));
              const at = Array.from({ length: n }, (_, i) => (i * length) / n + 0.05);
              const urls: string[] = [];
              const sink = new CanvasSink(track, { height: 96, poolSize: 1 });
              let last = "";
              for await (const c of sink.canvasesAtTimestamps(at)) {
                if (c) last = await toUrl(c.canvas);
                urls.push(last);
              }
              return { at, urls };
            } finally {
              input.dispose();
            }
          })();
    strips.set(source, s);
  }
  return s;
}

function peaksOf(channels: Float32Array[], rate: number, into: number[], offset: number) {
  const step = rate / PEAKS_PER_SECOND;
  const len = channels[0].length;
  for (let i = 0; i * step < len; i++) {
    let m = 0;
    const from = Math.floor(i * step);
    const to = Math.min(len, Math.floor((i + 1) * step));
    for (let j = from; j < to; j += 8) for (const ch of channels) m = Math.max(m, Math.abs(ch[j]));
    const k = offset + i;
    into[k] = Math.max(into[k] ?? 0, m);
  }
}

const waves = new WeakMap<object, Promise<number[]>>();
/** A video's sound shape, PEAKS_PER_SECOND values a second, 0 to 1. */
export function clipWave(source: Source): Promise<number[]> {
  let w = waves.get(source);
  if (!w) {
    w = (async () => {
      const { AudioBufferSink } = await import("mediabunny");
      const input = await inputOf(source);
      try {
        const track = await input.getPrimaryAudioTrack();
        if (!track || !(await track.canDecode())) return [];
        const out: number[] = [];
        for await (const b of new AudioBufferSink(track).buffers()) {
          const chans = Array.from({ length: b.buffer.numberOfChannels }, (_, i) => b.buffer.getChannelData(i));
          peaksOf(chans, b.buffer.sampleRate, out, Math.round(b.timestamp * PEAKS_PER_SECOND));
        }
        return normalise(out);
      } finally {
        input.dispose();
      }
    })().catch(() => []);
    waves.set(source, w);
  }
  return w;
}

/** A song's shape. */
export function songWave(file: File): Promise<number[]> {
  let w = waves.get(file);
  if (!w) {
    w = (async () => {
      const ctx = new OfflineAudioContext(1, 1, 48_000);
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      const out: number[] = [];
      peaksOf(Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)), buf.sampleRate, out, 0);
      return normalise(out);
    })().catch(() => []);
    waves.set(file, w);
  }
  return w;
}

function normalise(a: number[]) {
  const filled = Array.from(a, (x) => x ?? 0);
  const max = filled.reduce((m, x) => Math.max(m, x), 0.05);
  return filled.map((x) => Math.sqrt(x / max));
}
