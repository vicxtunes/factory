"use client";

// Measures a voice recording's waveform: splits the audio into
// CHAT_LIMITS.waveformBars equal slices and scores each slice's loudness
// from 0 to CHAT_LIMITS.waveformMax. The result is stored with the
// attachment so every player can draw the bars without fetching the audio.

import { CHAT_LIMITS } from "../policy";

/**
 * Returns bar heights for a recorded audio file, or null if this browser
 * can't decode it. Never throws: a missing waveform only costs the visual.
 */
export async function measureWaveform(file: Blob): Promise<number[] | null> {
  const Ctx = typeof window !== "undefined" ? (window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!Ctx) return null;

  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    const samples = audio.getChannelData(0);
    const bars = CHAT_LIMITS.waveformBars;
    const slice = Math.floor(samples.length / bars);
    if (slice < 1) return null;

    // Root-mean-square loudness per slice.
    const levels: number[] = [];
    for (let b = 0; b < bars; b++) {
      let sum = 0;
      for (let i = b * slice; i < (b + 1) * slice; i++) sum += samples[i] * samples[i];
      levels.push(Math.sqrt(sum / slice));
    }

    // Scale to the loudest slice so quiet speakers still get lively bars,
    // with a floor so silence reads as a short tick rather than nothing.
    const peak = Math.max(...levels);
    if (peak === 0) return levels.map(() => 0);
    return levels.map((l) => Math.round(Math.max(0.06, l / peak) * CHAT_LIMITS.waveformMax));
  } catch {
    return null;
  } finally {
    void ctx.close();
  }
}
