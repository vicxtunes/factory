import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import OpenAI from "openai";
import { z } from "zod";

import { SYSTEM_PROMPT } from "../core/prompt";
import type { AssistantModel, TokenUsage } from "../core/rules";
import type { AssistantTool } from "./tools";

const MAX_TOKENS = 4000;
const MAX_STEPS = 8;
const TIMEOUT_MS = 90_000;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AskInput {
  model: AssistantModel;
  /** The fixed instructions: the client-chat assistant's unless given. */
  system?: string;
  context: string;
  tools: AssistantTool[];
  messages: ChatTurn[];
  /** Told what's been used so far, so a run that fails partway is still counted. */
  onUsage: (usage: TokenUsage) => void;
  /** Given: the reply streams, its words told as they come, numbered by step of the tool loop (a later step's words replace an earlier one's). */
  onText?: (step: number, delta: string) => void;
}

export interface Answer {
  text: string | null;
  refused: boolean;
}

export function askModel(input: AskInput): Promise<Answer> {
  return input.model.provider === "openai" ? askOpenAI(input) : askClaude(input);
}

async function askClaude({ model, system = SYSTEM_PROMPT, context, tools, messages, onUsage, onText }: AskInput): Promise<Answer> {
  const params = {
    model: model.id,
    max_tokens: MAX_TOKENS,
    max_iterations: MAX_STEPS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
    output_config: { effort: "low" as const },
    system: [
      { type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } },
      { type: "text" as const, text: context },
    ],
    tools: tools.map((t) => betaZodTool({ name: t.name, description: t.description, inputSchema: t.inputSchema as z.ZodObject, run: t.run as (input: unknown) => Promise<string> })),
    messages,
  };
  const client = new Anthropic({ timeout: TIMEOUT_MS });
  const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const count = (message: Anthropic.Beta.BetaMessage) => {
    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;
    usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
    onUsage({ ...usage });
  };
  let last: Anthropic.Beta.BetaMessage | null = null;
  // Words written beside its tool calls (a question, with buttons to answer it) count when its last turn is empty.
  let said = "";
  const words = (m: Anthropic.Beta.BetaMessage) => m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  if (onText) {
    let step = 0;
    for await (const stream of client.beta.messages.toolRunner({ ...params, stream: true })) {
      const at = step++;
      stream.on("text", (delta) => onText(at, delta));
      last = await stream.finalMessage();
      said = words(last) || said;
      count(last);
    }
  } else {
    for await (const message of client.beta.messages.toolRunner(params)) {
      last = message;
      said = words(message) || said;
      count(message);
    }
  }
  if (last?.stop_reason === "refusal") return { text: null, refused: true };
  return { text: said || null, refused: false };
}

/** One tool call: its input checked against the schema, and a sentence back when it can't run. */
async function runTool(tools: AssistantTool[], name: string, args: string): Promise<string> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return `Refused: there's no tool called ${name}.`;
  let raw: unknown;
  try {
    raw = JSON.parse(args || "{}");
  } catch {
    return "Refused: the tool's input wasn't valid JSON.";
  }
  const parsed = tool.inputSchema.safeParse(raw);
  if (!parsed.success) return `Refused: bad input. ${parsed.error.message}`;
  try {
    return await tool.run(parsed.data as never);
  } catch (err) {
    console.error("assistant tool failed:", name, err);
    return "Failed: something went wrong. Hand to staff.";
  }
}

/**
 * The reply's words, from its message items. Not `response.output_text`: the SDK fills that in only for a
 * reply that wasn't streamed, so a streamed one has none (2026-11-08: every streamed reply failed on it).
 */
function replyText(response: OpenAI.Responses.Response): string {
  return response.output
    .flatMap((item) => (item.type === "message" ? item.content.flatMap((c) => (c.type === "output_text" ? [c.text] : [])) : []))
    .join("")
    .trim();
}

async function askOpenAI({ model, system = SYSTEM_PROMPT, context, tools, messages, onUsage, onText }: AskInput): Promise<Answer> {
  const client = new OpenAI({ timeout: TIMEOUT_MS });
  const definitions = tools.map((t): OpenAI.Responses.FunctionTool => {
    const parameters = { ...z.toJSONSchema(t.inputSchema), $schema: undefined };
    return { type: "function", name: t.name, description: t.description, parameters, strict: false };
  });
  const input: OpenAI.Responses.ResponseInputItem[] = [
    // The fixed instructions first: OpenAI caches a request's unchanged start by itself.
    { role: "developer", content: system },
    { role: "developer", content: context },
    ...messages,
  ];
  const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  let said = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const request = { model: model.id, max_output_tokens: MAX_TOKENS, reasoning: { effort: "low" as const }, tools: definitions, input };
    let response: OpenAI.Responses.Response | null = null;
    if (onText) {
      for await (const event of await client.responses.create({ ...request, stream: true })) {
        if (event.type === "response.output_text.delta") onText(step, event.delta);
        else if (event.type === "response.completed" || event.type === "response.incomplete") response = event.response;
        else if (event.type === "response.failed") throw new Error(event.response.error?.message ?? "The AI failed.");
      }
      if (!response) throw new Error("The AI's reply ended early.");
    } else {
      response = await client.responses.create(request);
    }
    const cached = response.usage?.input_tokens_details?.cached_tokens ?? 0;
    usage.input += (response.usage?.input_tokens ?? 0) - cached;
    usage.cacheRead += cached;
    usage.output += response.usage?.output_tokens ?? 0;
    onUsage({ ...usage });

    const refused = response.output.some((item) => item.type === "message" && item.content.some((c) => c.type === "refusal"));
    if (refused || response.incomplete_details?.reason === "content_filter") return { text: null, refused: true };
    const calls = response.output.filter((item) => item.type === "function_call");
    // Words written beside its tool calls (a question, with buttons to answer it) count when its last turn is empty.
    said = replyText(response) || said;
    if (!calls.length) return { text: said || null, refused: false };

    // Everything it produced goes back with the results: its reasoning has to stay with its calls.
    input.push(...(response.output as OpenAI.Responses.ResponseInputItem[]));
    for (const call of calls) {
      input.push({ type: "function_call_output", call_id: call.call_id, output: await runTool(tools, call.name, call.arguments) });
    }
  }
  return { text: null, refused: false };
}
