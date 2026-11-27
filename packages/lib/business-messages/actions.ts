"use server";

// Business messages (./core.ts) for the browser: the business's side (its
// workspace) and its client's side (the business's page, by its address).
// Every call checks who's asking (./server.ts) before anything else.

import type { ChatMessage } from "@repo/lib/chat/types";

import type { BizChatSummary, BizThread } from "./core";
import * as chats from "./server";
import { BizChatError, businessViewer, customerViewer, type Viewer } from "./server";

export type Res<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(who: () => Promise<Viewer>, fn: (v: Viewer) => Promise<T>): Promise<Res<T>> {
  try {
    return { ok: true, data: await fn(await who()) };
  } catch (err) {
    if (err instanceof BizChatError) return { ok: false, error: err.message };
    console.error("business messages failed:", err);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

/** Who's asking: the business (no address) or its client (the business's address). */
const viewer = (slug: string | null) => () => (slug === null ? businessViewer() : customerViewer(slug));

export async function bizChats(slug: string | null): Promise<Res<{ chats: BizChatSummary[]; channel: string }>> {
  return run(viewer(slug), async (v) => ({ chats: await chats.listChats(v), channel: chats.inboxChannel(v) }));
}

export async function bizThread(slug: string | null, chatId: string, before?: string | null): Promise<Res<BizThread>> {
  return run(viewer(slug), (v) => chats.thread(v, chatId, before));
}

export async function bizSend(slug: string | null, chatId: string, input: { body: string; replyToId?: string | null; attachments?: unknown[] }): Promise<Res<ChatMessage>> {
  return run(viewer(slug), (v) => chats.send(v, chatId, input));
}

export async function bizEdit(slug: string | null, messageId: string, body: string): Promise<Res> {
  return run(viewer(slug), async (v) => void (await chats.edit(v, messageId, body)));
}

export async function bizDelete(slug: string | null, messageId: string): Promise<Res> {
  return run(viewer(slug), async (v) => void (await chats.remove(v, messageId)));
}

export async function bizRead(slug: string | null, chatId: string): Promise<Res> {
  return run(viewer(slug), async (v) => void (await chats.markRead(v, chatId)));
}

export async function bizStartUpload(slug: string | null, chatId: string, input: { fileName: string; mimeType: string; sizeBytes: number }): Promise<Res<{ path: string; token: string; bucket: string }>> {
  return run(viewer(slug), (v) => chats.startUpload(v, chatId, input));
}

/** Business side: a client's chat (or one of their projects'), made the first time. */
export async function bizOpen(customerId: string, projectId?: string | null): Promise<Res<string>> {
  return run(viewer(null), (v) => chats.openChat(v, customerId, projectId ?? null));
}

/** Business side: its clients, to start a chat with. */
export async function bizClients(): Promise<Res<{ id: string; name: string; phone: string | null }[]>> {
  return run(viewer(null), (v) => chats.clientsToMessage(v));
}

/** Client side: this phone gets the business's messages as notifications. */
export async function bizSaveDevice(slug: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<Res> {
  return run(viewer(slug), async (v) => {
    if (v.side !== "customer") throw new BizChatError("Sign in again.");
    await chats.saveDevice(v, sub);
    return undefined;
  });
}
