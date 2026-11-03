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
  context: string;
  tools: AssistantTool[];
  messages: ChatTurn[];
  /** Told what's been used so far, so a run that fails partway is still counted. */
  onUsage: (usage: TokenUsage) => void;
}

export interface Answer {
  text: string | null;
  refused: boolean;
}

export function askModel(input: AskInput): Promise<Answer> {
  return input.model.provider === "openai" ? askOpenAI(input) : askClaude(input);
}

async function askClaude({ model, context, tools, messages, onUsage }: AskInput): Promise<Answer> {
  const runner = new Anthropic({ timeout: TIMEOUT_MS }).beta.messages.toolRunner({
    model: model.id,
    max_tokens: MAX_TOKENS,
    max_iterations: MAX_STEPS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: context },
    ],
    tools: tools.map((t) => betaZodTool({ name: t.name, description: t.description, inputSchema: t.inputSchema as z.ZodObject, run: t.run as (input: unknown) => Promise<string> })),
    messages,
  });
  const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let last: Anthropic.Beta.BetaMessage | null = null;
  for await (const message of runner) {
    last = message;
    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;
    usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
    onUsage({ ...usage });
  }
  if (last?.stop_reason === "refusal") return { text: null, refused: true };
  return { text: last?.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim() || null, refused: false };
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

async function askOpenAI({ model, context, tools, messages, onUsage }: AskInput): Promise<Answer> {
  const client = new OpenAI({ timeout: TIMEOUT_MS });
  const definitions = tools.map((t): OpenAI.Chat.ChatCompletionTool => {
    const parameters = { ...z.toJSONSchema(t.inputSchema), $schema: undefined };
    return { type: "function", function: { name: t.name, description: t.description, parameters } };
  });
  const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
    // The fixed instructions first: OpenAI caches a request's unchanged start by itself.
    { role: "developer", content: SYSTEM_PROMPT },
    { role: "developer", content: context },
    ...messages,
  ];
  const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.chat.completions.create({
      model: model.id,
      max_completion_tokens: MAX_TOKENS,
      reasoning_effort: "low",
      tools: definitions,
      messages: history,
    });
    const cached = response.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    usage.input += (response.usage?.prompt_tokens ?? 0) - cached;
    usage.cacheRead += cached;
    usage.output += response.usage?.completion_tokens ?? 0;
    onUsage({ ...usage });

    const choice = response.choices[0];
    if (!choice || choice.message.refusal || choice.finish_reason === "content_filter") return { text: null, refused: true };
    const calls = choice.message.tool_calls ?? [];
    if (!calls.length) return { text: choice.message.content?.trim() || null, refused: false };

    history.push(choice.message);
    for (const call of calls) {
      const content = call.type === "function" ? await runTool(tools, call.function.name, call.function.arguments) : "Refused: unsupported tool.";
      history.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  return { text: null, refused: false };
}
