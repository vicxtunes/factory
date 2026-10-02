import "server-only";

import type { ChatResult } from "../types";

import { ChatError, requireChatViewer, type ChatViewer } from "./identity";

// The one wrapper every chat entry point (Server Actions in ../actions.ts,
// server reads in ../reads.ts) runs its service call through:
// resolve who's calling, call the service, and convert the outcome into a
// ChatResult. Expected failures (ChatError) become `{ ok: false, error }`
// with a user-safe message; anything unexpected is logged server-side and
// replaced with a generic message, so internals never reach the browser.
export async function run<T>(fn: (viewer: ChatViewer) => Promise<T>): Promise<ChatResult<T>>;
export async function run(fn: (viewer: ChatViewer) => Promise<void>): Promise<ChatResult>;
export async function run<T>(
  fn: (viewer: ChatViewer) => Promise<T>,
): Promise<{ ok: true; data?: T } | { ok: false; error: string }> {
  try {
    const viewer = await requireChatViewer();
    const data = await fn(viewer);
    return data === undefined ? { ok: true } : { ok: true, data };
  } catch (err) {
    if (err instanceof ChatError) return { ok: false, error: err.message };
    console.error("chat action failed:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
