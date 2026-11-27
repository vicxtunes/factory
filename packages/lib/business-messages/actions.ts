"use server";

// Business messages (./core.ts) for the browser: the business's side (its
// workspace) and its client's side (the business's page, by its address).
// Every call checks who's asking (./server.ts) before anything else.

import type { ChatMessage } from "@repo/lib/chat/types";

import { setPortalCookie } from "@repo/lib/studio-portal/server";
import { studioScope } from "@repo/lib/studios/core";

import type { BizChatSummary, BizThread, ChatDocument, LeadRow } from "./core";
import * as credits from "./credits";
import * as leads from "./leads";
import * as chats from "./server";
import { BizChatError, businessViewer, customerViewer, type Viewer } from "./server";

export type Res<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function run<T, V extends Viewer = Viewer>(who: () => Promise<V>, fn: (v: V) => Promise<T>): Promise<Res<T>> {
  try {
    return { ok: true, data: await fn(await who()) };
  } catch (err) {
    if (err instanceof BizChatError) return { ok: false, error: err.message };
    console.error("business messages failed:", err);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

/** Who's asking: the business (no address) or its client (the business's address). */
const viewer = (slug: string | null) => (): Promise<Viewer> => (slug === null ? businessViewer() : customerViewer(slug));

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

// ── Leads (./leads.ts) ────────────────────────────────────────────────────

/** "Message us" on the business's page: signs this phone in, sends the message, starts a lead. Returns where the chat is. */
export async function startLeadAt(slug: string, input: unknown): Promise<Res<{ chatId: string; slug: string }>> {
  try {
    if (typeof slug !== "string") throw new BizChatError("This business isn't here any more.");
    const { session, chatId, slug: at } = await leads.startLead(slug, input);
    if (session) await setPortalCookie(session);
    return { ok: true, data: { chatId, slug: at } };
  } catch (err) {
    if (err instanceof BizChatError) return { ok: false, error: err.message };
    console.error("leads: starting one failed:", err);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

const business = businessViewer;

export async function bizLeads(): Promise<Res<{ leads: LeadRow[]; assistant: boolean; currency: string }>> {
  return run(business, async (v) => {
    const [rows, assistant] = await Promise.all([leads.listLeads(v), leads.leadAssistantOn(v.studio.id)]);
    return { leads: rows, assistant, currency: studioScope(v.studio).currency };
  });
}

export async function bizSetLeadLost(leadId: string, lost: boolean): Promise<Res> {
  return run(business, async (v) => void (await leads.setLeadLost(v, leadId, lost === true)));
}

export async function bizSetLeadAssistant(on: boolean): Promise<Res> {
  return run(business, async (v) => void (await leads.setLeadAssistant(v, on === true)));
}

export async function bizDocuments(chatId: string): Promise<Res<{ customerId: string; documents: ChatDocument[] }>> {
  return run(business, (v) => leads.documentsFor(v, chatId));
}

export async function bizSendDocument(chatId: string, kind: "quotation" | "invoice", id: string): Promise<Res<ChatMessage>> {
  return run(business, (v) => leads.sendDocument(v, chatId, kind, id));
}

/** The team hands a chat to Alexis (false) or takes it from her (true). */
export async function bizSetAssistantPaused(chatId: string, paused: boolean): Promise<Res> {
  return run(business, async (v) => void (await chats.setAssistantPaused(v, chatId, paused === true)));
}

// ── Alexis's credits (./credits.ts) ──────────────────────────────────────

export async function bizCredits(): Promise<Res<{ balance: number; usedThisMonth: number; packs: readonly number[]; canBuy: boolean }>> {
  return run(business, async (v) => ({ ...(await credits.creditSummary(v.studio.id)), packs: credits.CREDIT_PACKS, canBuy: v.studio.ownerClientId === v.clientId }));
}

/** The owner buys a pack of credits from their Aming card. */
export async function bizBuyCredits(amount: number): Promise<Res> {
  return run(business, async (v) => {
    if (v.studio.ownerClientId !== v.clientId) throw new BizChatError("Only the owner buys credits.");
    await credits.buyCredits(v.studio.id, Number(amount), { id: v.clientId, name: v.name });
    return undefined;
  });
}
