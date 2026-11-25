// The video editor's export, in the business's browser (the VPS is small and
// serves everyone): every clip's frames drawn in turn on a canvas of the chosen
// size (cropped to fill it, in the chosen look), the words and the logo on top,
// encoded as H.264; the sound mixed apart (each clip's own at its volume, the
// song over it) and encoded as AAC. One MP4 comes out.

import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  UrlSource,
  VideoSampleSink,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";

import { FPS, TRANSITION_SECONDS, filterCss, fontCss, frameSize, labelInk, newId, readableUrl, textAt, totalLength, used, type Clip, type Project, type Source, type TextItem } from "./model";

const RATE = 48_000;

const inputOf = (s: Source) => new Input({ source: s.kind === "url" ? new UrlSource(readableUrl(s.url)) : new BlobSource(s.file), formats: ALL_FORMATS });
const blobOf = async (s: Source) => (s.kind === "file" ? s.file : await (await fetch(readableUrl(s.url))).blob());

async function aacReady() {
  if (await canEncodeAudio("aac")) return;
  const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
  registerAacEncoder();
}

/** What a picked file or uploaded media is: a video's length, size and sound, or a photo's size. */
export async function probe(source: Source, name: string): Promise<Clip> {
  const blob = source.kind === "file" ? source.file : null;
  const isImage = blob ? blob.type.startsWith("image/") : /\.(jpe?g|png|webp)(\?|$)/i.test(source.kind === "url" ? source.url : "");
  if (isImage) {
    const bmp = await createImageBitmap(await blobOf(source));
    const clip: Clip = { id: newId(), source, type: "image", name, length: 3, in: 0, out: 3, width: bmp.width, height: bmp.height, hasSound: false, volume: 0, transition: "none" };
    bmp.close();
    return clip;
  }
  const input = inputOf(source);
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("That file has no picture.");
    const length = await input.computeDuration();
    const sound = await input.getPrimaryAudioTrack();
    return { id: newId(), source, type: "video", name, length, in: 0, out: length, width: await video.getDisplayWidth(), height: await video.getDisplayHeight(), hasSound: !!sound, volume: 1, transition: "none" };
  } finally {
    input.dispose();
  }
}

/** The sound of the finished video: each clip's own at its volume, one after another, and the song over all. */
async function mixSound(p: Project, seconds: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(seconds * RATE)), RATE);
  let t0 = 0;
  for (const c of p.clips) {
    const len = used(c);
    if (c.type === "video" && c.hasSound && c.volume > 0) {
      const input = inputOf(c.source);
      try {
        const track = await input.getPrimaryAudioTrack();
        if (track && (await track.canDecode())) {
          const gain = ctx.createGain();
          gain.gain.value = c.volume;
          gain.connect(ctx.destination);
          for await (const b of new AudioBufferSink(track).buffers(c.in, c.out)) {
            const skip = Math.max(0, c.in - b.timestamp);
            const when = t0 + Math.max(0, b.timestamp - c.in);
            const dur = Math.min(b.buffer.duration - skip, t0 + len - when);
            if (dur <= 0) continue;
            const src = ctx.createBufferSource();
            src.buffer = b.buffer;
            src.connect(gain);
            src.start(when, skip, dur);
          }
        }
      } finally {
        input.dispose();
      }
    }
    t0 += len;
  }
  if (p.song && p.song.volume > 0) {
    const decoded = await ctx.decodeAudioData(await p.song.file.arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(p.song.volume, 0);
    gain.gain.setValueAtTime(p.song.volume, Math.max(0, seconds - 1.5));
    gain.gain.linearRampToValueAtTime(0, seconds);
    src.connect(gain).connect(ctx.destination);
    src.start(Math.max(0, -p.song.start), Math.min(Math.max(0, p.song.start), Math.max(0, decoded.duration - 0.1)));
  }
  return ctx.startRendering();
}

type Ctx = OffscreenCanvasRenderingContext2D;

/** Words: wrapped to the frame, in their font, style and animation. The preview draws them with CSS. */
function drawText(ctx: Ctx, w: number, h: number, item: TextItem, t: number) {
  const now = textAt(item, t);
  if (now.alpha <= 0 || !now.text.trim()) return;
  const px = Math.round(item.size * w);
  const font = fontCss(item.font);
  ctx.save();
  ctx.font = `${font.weight} ${px}px ${font.css}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Wrap the whole text, so a typewriter doesn't reflow as it types.
  const max = w * 0.86;
  const wrap = (text: string) => {
    const lines: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > max && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  };
  const full = wrap(item.text);
  let left = now.text.length;
  const lines = full.map((l) => {
    const part = l.slice(0, Math.max(0, left));
    left -= l.length + 1;
    return part;
  });
  const lh = px * 1.2;
  ctx.globalAlpha = now.alpha;
  ctx.translate(item.x * w, (item.y + now.dy) * h);
  ctx.scale(now.scale, now.scale);
  const top = -((full.length - 1) * lh) / 2;
  lines.forEach((line, i) => {
    if (!line) return;
    const y = top + i * lh;
    const tw = ctx.measureText(line).width + px * 0.6;
    if (item.style === "box" || item.style === "label") {
      ctx.fillStyle = item.style === "box" ? "rgba(0,0,0,0.62)" : item.color;
      ctx.beginPath();
      ctx.roundRect(-tw / 2, y - lh / 2, tw, lh, px * 0.22);
      ctx.fill();
      ctx.fillStyle = item.style === "box" ? item.color : labelInk(item.color);
      ctx.fillText(line, 0, y);
    } else if (item.style === "glow") {
      ctx.shadowColor = item.color;
      ctx.shadowBlur = px * 0.5;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(line, 0, y);
      ctx.fillText(line, 0, y);
    } else if (item.style === "shadow") {
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowOffsetX = px * 0.06;
      ctx.shadowOffsetY = px * 0.08;
      ctx.shadowBlur = px * 0.12;
      ctx.fillStyle = item.color;
      ctx.fillText(line, 0, y);
    } else {
      ctx.lineWidth = Math.max(2, px * 0.12);
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineJoin = "round";
      ctx.strokeText(line, 0, y);
      ctx.fillStyle = item.color;
      ctx.fillText(line, 0, y);
    }
  });
  ctx.restore();
}


function drawOverlays(ctx: Ctx, w: number, h: number, p: Project, t: number, logo: ImageBitmap | null) {
  for (const item of p.texts) if (item.text.trim() && t >= item.start && t < item.end) drawText(ctx, w, h, item, t);
  if (logo && p.logo) {
    const lw = p.logo.size * w;
    const lh = (lw * logo.height) / logo.width;
    const m = w * 0.04;
    const x = p.logo.corner.endsWith("l") ? m : w - m - lw;
    const y = p.logo.corner.startsWith("t") ? m : h - m - lh;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(logo, x, y, lw, lh);
    ctx.globalAlpha = 1;
  }
}

/** Draws a picture of size sw×sh to fill the frame (cropping what spills). */
const cover = (w: number, h: number, sw: number, sh: number) => {
  const s = Math.max(w / sw, h / sh);
  return { x: (w - sw * s) / 2, y: (h - sh * s) / 2, dw: sw * s, dh: sh * s };
};

/** The finished video. */
export async function render(p: Project, onProgress: (share: number) => void): Promise<File> {
  if (!p.clips.length) throw new Error("Add a clip first.");
  await aacReady();
  const { w, h } = frameSize(p);
  if (!(await canEncodeVideo("avc", { width: w, height: h }))) throw new Error("This browser can't make videos. Try Chrome on a computer or phone.");
  const seconds = totalLength(p);
  const frames = Math.max(1, Math.round(seconds * FPS));
  const sound = await mixSound(p, seconds);
  onProgress(0.05);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  // Each clip's frame is drawn on `base` (cropped, in the look); the frame that
  // goes out is `base` with the transition, then the words and the logo.
  const base = new OffscreenCanvas(w, h);
  const bctx = base.getContext("2d")!;
  const prev = new OffscreenCanvas(w, h);
  const pctx = prev.getContext("2d")!;
  const logo = p.logo ? await createImageBitmap(await blobOf(p.logo.source)) : null;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: "avc", bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  const audio = new AudioBufferSource({ codec: "aac", bitrate: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: FPS });
  output.addAudioTrack(audio);
  await output.start();
  await audio.add(sound);
  audio.close();

  const filter = filterCss(p);
  let frame = 0;
  let t0 = 0;
  let index = 0;
  const put = async () => {
    const t = frame / FPS;
    const c = p.clips[index];
    const k = index > 0 && c.transition !== "none" ? (t - t0) / TRANSITION_SECONDS : 1;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    if (k >= 1) ctx.drawImage(base, 0, 0);
    else if (c.transition === "fade") {
      // Out to black, then in from black.
      if (k < 0.5) {
        ctx.drawImage(prev, 0, 0);
        ctx.fillStyle = `rgba(0,0,0,${k * 2})`;
      } else {
        ctx.drawImage(base, 0, 0);
        ctx.fillStyle = `rgba(0,0,0,${(1 - k) * 2})`;
      }
      ctx.fillRect(0, 0, w, h);
    } else if (c.transition === "dissolve") {
      ctx.drawImage(prev, 0, 0);
      ctx.globalAlpha = k;
      ctx.drawImage(base, 0, 0);
      ctx.globalAlpha = 1;
    } else if (c.transition === "flash") {
      ctx.drawImage(base, 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${(1 - k) * (1 - k)})`;
      ctx.fillRect(0, 0, w, h);
    } else if (c.transition === "zoom") {
      const s = 1 + 0.3 * (1 - k) * (1 - k);
      ctx.drawImage(base, (w - w * s) / 2, (h - h * s) / 2, w * s, h * s);
    } else if (c.transition === "slide") {
      const e = 1 - (1 - k) * (1 - k) * (1 - k);
      ctx.drawImage(prev, -w * e, 0);
      ctx.drawImage(base, w * (1 - e), 0);
    }
    drawOverlays(ctx, w, h, p, t, logo);
    await video.add(t, 1 / FPS);
    frame++;
    if (frame % 15 === 0) onProgress(0.05 + 0.95 * Math.min(1, frame / frames));
  };
  const paint = (sw: number, sh: number, draw: (r: ReturnType<typeof cover>) => void) => {
    bctx.filter = filter;
    bctx.fillStyle = "#000";
    bctx.fillRect(0, 0, w, h);
    draw(cover(w, h, sw, sh));
    bctx.filter = "none";
  };

  for (; index < p.clips.length; index++) {
    const c = p.clips[index];
    const end = Math.round((t0 + used(c)) * FPS);
    if (c.type === "image") {
      const bmp = await createImageBitmap(await blobOf(c.source));
      paint(bmp.width, bmp.height, (r) => bctx.drawImage(bmp, r.x, r.y, r.dw, r.dh));
      while (frame < end) await put();
      bmp.close();
    } else {
      const input = inputOf(c.source);
      try {
        const track = await input.getPrimaryVideoTrack();
        if (!track) throw new Error(`${c.name} has no picture.`);
        const sink = new VideoSampleSink(track);
        const first = frame;
        const stamps = function* () {
          for (let f = first; f < end; f++) yield c.in + (f - first) / FPS;
        };
        for await (const sample of sink.samplesAtTimestamps(stamps())) {
          if (sample) {
            paint(sample.displayWidth, sample.displayHeight, (r) => sample.draw(bctx, r.x, r.y, r.dw, r.dh));
            sample.close();
          }
          await put();
        }
        // A clip that ran out of frames early holds its last one.
        while (frame < end) await put();
      } finally {
        input.dispose();
      }
    }
    pctx.drawImage(base, 0, 0);
    t0 += used(c);
  }
  video.close();
  logo?.close();
  await output.finalize();
  return new File([output.target.buffer!], "edited.mp4", { type: "video/mp4" });
}

/** A clip's sound on its own, as an M4A to keep (copied, not re-encoded, when it can be). */
export async function soundOnly(c: Clip): Promise<File> {
  await aacReady();
  const input = inputOf(c.source);
  try {
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    const conversion = await Conversion.init({ input, output, video: { discard: true }, trim: { start: c.in, end: c.out }, showWarnings: false });
    if (!conversion.isValid) throw new Error("That clip's sound can't be taken out here.");
    await conversion.execute();
    return new File([output.target.buffer!], `${c.name.replace(/\.[^.]+$/, "")} sound.m4a`, { type: "audio/mp4" });
  } finally {
    input.dispose();
  }
}
