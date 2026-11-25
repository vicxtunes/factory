// Puts the business's own song into a post, in their browser (the VPS is
// small and serves everyone; owner, 2026-11-24: "allow me to attach my own
// sounds"). A video keeps its picture untouched (copied, not re-encoded) and
// gets a new sound track: the song, with the video's own sound under it if
// they keep it. Photos become a 9:16 slideshow video with the song. Either
// way the result is an MP4 that goes out by itself to every page.

import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  UrlSource,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";

import { readableUrl } from "./editor/model";

const RATE = 48_000;
const W = 1080;
const H = 1920;
const FPS = 30;
/** Seconds each photo shows in a slideshow. */
export const PHOTO_SECONDS = 3;

export interface SoundChoice {
  file: File;
  /** Where in the song to start, seconds. */
  start: number;
  /** Keep the video's own sound (at half) under the song. */
  keepOwn: boolean;
}

async function aacReady() {
  if (await canEncodeAudio("aac")) return;
  const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
  registerAacEncoder();
}

export async function songLength(file: File): Promise<number> {
  const ctx = new OfflineAudioContext(2, 1, RATE);
  return (await ctx.decodeAudioData(await file.arrayBuffer())).duration;
}

/** The song (from `start`) over `seconds`, fading out at the end, plus any sound already there. */
async function mixdown(song: SoundChoice, seconds: number, own: { buffer: AudioBuffer; at: number }[]): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
  const decoded = await ctx.decodeAudioData(await song.file.arrayBuffer());
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  const gain = ctx.createGain();
  const level = own.length ? 0.8 : 1;
  gain.gain.setValueAtTime(level, 0);
  gain.gain.setValueAtTime(level, Math.max(0, seconds - 1.5));
  gain.gain.linearRampToValueAtTime(0, seconds);
  src.connect(gain).connect(ctx.destination);
  src.start(0, Math.min(song.start, Math.max(0, decoded.duration - 0.1)));
  if (own.length) {
    const under = ctx.createGain();
    under.gain.value = 0.5;
    under.connect(ctx.destination);
    for (const o of own) {
      const s = ctx.createBufferSource();
      s.buffer = o.buffer;
      s.connect(under);
      s.start(Math.max(0, o.at));
    }
  }
  return ctx.startRendering();
}

function mp4() {
  return new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
}

function asFile(output: Output<Mp4OutputFormat, BufferTarget>, name: string) {
  return new File([output.target.buffer!], name, { type: "video/mp4" });
}

/** The video at `url` with the song as its sound. */
export async function songOnVideo(url: string, song: SoundChoice, onProgress: (p: number) => void): Promise<File> {
  await aacReady();
  const input = new Input({ source: new UrlSource(readableUrl(url)), formats: ALL_FORMATS });
  try {
    const seconds = await input.computeDuration();
    const own: { buffer: AudioBuffer; at: number }[] = [];
    const ownTrack = song.keepOwn ? await input.getPrimaryAudioTrack() : null;
    if (ownTrack && (await ownTrack.canDecode())) {
      for await (const b of new AudioBufferSink(ownTrack).buffers()) own.push({ buffer: b.buffer, at: b.timestamp });
    }
    onProgress(0.15);
    const sound = await mixdown(song, seconds, own);
    onProgress(0.3);

    const output = mp4();
    const conversion = await Conversion.init({ input, output, audio: { discard: true }, composable: true, showWarnings: false });
    if (!conversion.isValid) throw new Error("This video can't be read here. Try an MP4.");
    conversion.onProgress = (p) => onProgress(0.3 + p * 0.7);
    const audio = new AudioBufferSource({ codec: "aac", bitrate: QUALITY_HIGH });
    output.addAudioTrack(audio);
    await output.start();
    await Promise.all([
      conversion.execute(),
      audio.add(sound).then(() => audio.close()),
    ]);
    await output.finalize();
    return asFile(output, "with-sound.mp4");
  } finally {
    input.dispose();
  }
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error("A photo wouldn't load. Try again."));
    img.src = readableUrl(url);
  });
}

/** Photo `img` on the frame: blurred and filling behind, whole and slowly zooming in front. */
function draw(ctx: OffscreenCanvasRenderingContext2D, img: HTMLImageElement, t: number) {
  const cover = Math.max(W / img.width, H / img.height);
  ctx.filter = "blur(40px) brightness(0.7)";
  ctx.drawImage(img, (W - img.width * cover) / 2, (H - img.height * cover) / 2, img.width * cover, img.height * cover);
  ctx.filter = "none";
  const fit = Math.min(W / img.width, H / img.height) * (1 + 0.06 * t);
  ctx.drawImage(img, (W - img.width * fit) / 2, (H - img.height * fit) / 2, img.width * fit, img.height * fit);
}

/** The photos as a 9:16 slideshow with the song. */
export async function songOnPhotos(urls: string[], song: SoundChoice, onProgress: (p: number) => void): Promise<File> {
  await aacReady();
  if (!(await canEncodeVideo("avc", { width: W, height: H }))) throw new Error("This browser can't make videos. Try Chrome on a computer.");
  const images = await Promise.all(urls.map(load));
  const seconds = images.length * PHOTO_SECONDS;
  const sound = await mixdown(song, seconds, []);
  onProgress(0.1);

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext("2d")!;
  const output = mp4();
  const video = new CanvasSource(canvas, { codec: "avc", bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  const audio = new AudioBufferSource({ codec: "aac", bitrate: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: FPS });
  output.addAudioTrack(audio);
  await output.start();
  await audio.add(sound);
  audio.close();
  const frames = seconds * FPS;
  for (let f = 0; f < frames; f++) {
    const at = f / FPS;
    draw(ctx, images[Math.min(images.length - 1, Math.floor(at / PHOTO_SECONDS))], (at % PHOTO_SECONDS) / PHOTO_SECONDS);
    await video.add(at, 1 / FPS);
    if (f % FPS === 0) onProgress(0.1 + (f / frames) * 0.9);
  }
  video.close();
  await output.finalize();
  return asFile(output, "slideshow.mp4");
}
