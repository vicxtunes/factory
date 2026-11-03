import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { postAssistantMessage } from "@repo/lib/chat/assistant";
import { chatHref } from "@repo/lib/chat/routes";
import { createAdminClient } from "@repo/lib/supabase/admin";

import { SYSTEM_PROMPT } from "../core/prompt";
import { ASSISTANT_NAME, costUsd, mayAnswer } from "../core/rules";
import * as store from "./store";
import { assistantTools, tellManagers, type ToolContext } from "./tools";

const MODEL = "claude-opus-5-5";
const MESSAGES_READ = 40;
const CHATS_AT_ONCE = 5;
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

/** The chat as Claude reads it. Only the client's own words are in their voice. */
function toMessages(rows: ChatRow[]): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const row of rows) {
    if (!row.sender_type && row.sender_name === ASSISTANT_NAME && row.kind === "text") {
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

    const ctx: ToolContext = { conversationId, client, actions: [] };
    const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let reply: string | null = null;
    let failure: string | null = null;
    try {
      const runner = new Anthropic({ timeout: 90_000 }).beta.messages.toolRunner({
        model: MODEL,
        max_tokens: 4000,
        max_iterations: 8,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
          { type: "text", text: `Today is ${new Date().toISOString().slice(0, 10)}. You're talking to ${client.name}.` },
        ],
        tools: assistantTools(ctx),
        messages: toMessages(rows),
      });
      let last: Anthropic.Beta.BetaMessage | null = null;
      for await (const message of runner) {
        last = message;
        totals.input += message.usage.input_tokens;
        totals.output += message.usage.output_tokens;
        totals.cacheRead += message.usage.cache_read_input_tokens ?? 0;
        totals.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
      }
      if (last?.stop_reason === "refusal") failure = "Claude declined to answer.";
      else reply = last?.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim() || null;
      if (!reply && !failure) failure = "Claude gave no reply.";
    } catch (err) {
      failure = err instanceof Error ? err.message : "Claude couldn't be reached.";
      console.error("assistant failed:", conversationId, err);
    }

    // Someone took over while it was thinking: they speak now, unless it handed over itself.
    const handedOverItself = ctx.actions.some((a) => a.startsWith("Handed to staff"));
    const quiet = (await store.threadState(conversationId)) === "staff" && !handedOverItself;
    if (failure) {
      await handOver(handCtx, `The assistant couldn't answer: ${failure}`, !quiet);
    } else if (reply && !quiet) {
      await postAssistantMessage(conversationId, client.id, ASSISTANT_NAME, reply);
      await store.markSummaryPosted(conversationId);
    }
    await store.logRun({ conversationId, clientId: client.id, reply, actions: ctx.actions, error: failure, ...totals, costUsd: costUsd(totals) });
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
