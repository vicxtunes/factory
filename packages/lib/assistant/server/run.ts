import "server-only";

import { announceTyping, postAssistantMessage } from "@repo/lib/chat/assistant";
import { chatHref } from "@repo/lib/chat/routes";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { ASSISTANT_NAME, ASSISTANT_NAMES, costUsd, findModel, mayAnswer, type TokenUsage } from "../core/rules";
import { askModel, type ChatTurn } from "./providers";
import * as store from "./store";
import { assistantTools, tellManagers, type ToolContext } from "./tools";

const MESSAGES_READ = 40;
const CHATS_AT_ONCE = 5;
const TYPING_EVERY_MS = 4_000;
const SORRY = "Sorry, I can't help with that right now. Someone from the team will reply here shortly.";

interface ChatRow {
  kind: string;
  sender_type: string | null;
  sender_id: string | null;
  sender_name: string | null;
  body: string;
  chat_attachments: { id: string; kind: string; file_name: string }[];
}

async function readChat(conversationId: string): Promise<ChatRow[]> {
  const { data, error } = await createAdminClient()
    .from("chat_messages")
    .select("kind, sender_type, sender_id, sender_name, body, chat_attachments(id, kind, file_name)")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MESSAGES_READ);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ChatRow[]).reverse();
}

/** The chat as the AI reads it. Only the client's own words are in their voice. */
function toMessages(rows: ChatRow[]): ChatTurn[] {
  const messages: ChatTurn[] = [];
  for (const row of rows) {
    if (!row.sender_type && ASSISTANT_NAMES.includes(row.sender_name ?? "") && row.kind === "text") {
      if (messages.length) messages.push({ role: "assistant", content: row.body });
      continue;
    }
    if (row.sender_type === "client") {
      const files = row.chat_attachments.map((a) =>
        a.kind === "audio" ? "[voice note, can't be heard]" : `[attached id=${a.id} ${a.kind} "${a.file_name}"]`,
      );
      const text = [row.body, ...files].filter(Boolean).join("\n");
      if (text) messages.push({ role: "user", content: text });
      continue;
    }
    const who = row.sender_type ? `Staff ${row.sender_name ?? ""}`.trim() : "Aming update";
    messages.push({ role: "user", content: `[${who}: ${row.body}]` });
  }
  return messages;
}

/** What changes from call to call. The chat shows only words, so it says what's waiting behind them. */
async function contextFor(conversationId: string, clientName: string): Promise<string> {
  const lines = [`Today is ${new Date().toISOString().slice(0, 10)}. You're talking to ${clientName}.`];
  const { data: chat } = await createAdminClient().from("chat_conversations").select("orders(id, order_no)").eq("id", conversationId).maybeSingle();
  const order = chat?.orders as unknown as { id: string; order_no: string } | null;
  if (order) lines.push(`This chat is about order ${order.order_no} (order_id ${order.id}). Anything the client says or sends here is about it unless they say otherwise.`);
  const pending = await store.getPendingOrder(conversationId);
  if (pending?.posted_at) {
    lines.push(`This order summary has been shown to the client and is ready to place:\n${pending.summary}\nIf their latest message agrees to it, call place_order now, without prepare_order. If they change something, call prepare_order again.`);
  }
  return lines.join("\n\n");
}

async function loadClient(id: string): Promise<ToolContext["client"] | null> {
  const { data } = await createAdminClient().from("clients").select("id, name, email, phone").eq("id", id).maybeSingle();
  return data;
}

async function handOver(ctx: { conversationId: string; clientId: string; clientName: string }, reason: string, tellClient: boolean): Promise<void> {
  await store.setState(ctx.conversationId, "staff");
  if (tellClient) await postAssistantMessage(ctx.conversationId, ctx.clientId, ASSISTANT_NAME, SORRY);
  await tellManagers(`${ctx.clientName} needs a person`, reason, chatHref(ctx.conversationId));
}

async function answer(thread: store.ThreadRow, settings: store.AssistantSettings): Promise<void> {
  if (!(await store.claim(thread))) return;
  const conversationId = thread.conversation_id;
  try {
    const rows = await readChat(conversationId);
    const clientId = [...rows].reverse().find((r) => r.sender_type === "client")?.sender_id;
    const client = clientId ? await loadClient(clientId) : null;
    if (!client || !mayAnswer(settings.mode, settings.testClients, client)) return;

    const handCtx = { conversationId, clientId: client.id, clientName: client.name };
    if ((await store.spentToday()) >= settings.dailyCapUsd) {
      await handOver(handCtx, "The assistant reached today's spending limit.", true);
      return;
    }

    const ctx: ToolContext = { conversationId, client, actions: [], choices: [], images: [] };
    const model = findModel(settings.model);
    let totals: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let reply: string | null = null;
    let failure: string | null = null;
    void announceTyping(conversationId, ASSISTANT_NAME, true);
    const typing = setInterval(() => void announceTyping(conversationId, ASSISTANT_NAME, true), TYPING_EVERY_MS);
    try {
      if (!model) throw new Error(`Unknown model ${settings.model}.`);
      const answered = await askModel({
        model,
        context: await contextFor(conversationId, client.name),
        tools: assistantTools(ctx),
        messages: toMessages(rows),
        onUsage: (u) => {
          totals = u;
        },
      });
      if (answered.refused) failure = "The AI declined to answer.";
      else reply = answered.text;
      if (!reply && !failure) failure = "The AI gave no reply.";
    } catch (err) {
      failure = err instanceof Error ? err.message : "The AI couldn't be reached.";
      console.error("assistant failed:", conversationId, err);
    } finally {
      clearInterval(typing);
      void announceTyping(conversationId, ASSISTANT_NAME, false);
    }

    // Someone took over while it was thinking: they speak now.
    const quiet = (await store.threadState(conversationId)) === "staff";
    if (failure) {
      await handOver(handCtx, `The assistant couldn't answer: ${failure}`, !quiet);
    } else if (reply && !quiet) {
      await postAssistantMessage(conversationId, client.id, ASSISTANT_NAME, reply, { choices: ctx.choices, images: ctx.images });
      await store.markSummaryPosted(conversationId);
    }
    await store.logRun({ conversationId, clientId: client.id, reply, actions: ctx.actions, error: failure, ...totals, costUsd: model ? costUsd(model, totals) : 0 });
  } finally {
    await store.finish(thread);
  }
}

/** Answers the chats waiting for a reply. Run every few seconds by the client app. */
export async function answerWaitingChats(): Promise<void> {
  const settings = await store.getSettings();
  const waiting = await store.waitingThreads(CHATS_AT_ONCE);
  if (settings.mode === "off" || !waiting.length) return;
  await Promise.all(waiting.map((t) => answer(t, settings).catch((err) => console.error("assistant:", t.conversation_id, err))));
}
