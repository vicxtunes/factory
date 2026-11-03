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
  const definitions = tools.map((t): OpenAI.Responses.FunctionTool => {
    const parameters = { ...z.toJSONSchema(t.inputSchema), $schema: undefined };
    return { type: "function", name: t.name, description: t.description, parameters, strict: false };
  });
  const input: OpenAI.Responses.ResponseInputItem[] = [
    // The fixed instructions first: OpenAI caches a request's unchanged start by itself.
    { role: "developer", content: SYSTEM_PROMPT },
    { role: "developer", content: context },
    ...messages,
  ];
  const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.responses.create({
      model: model.id,
      max_output_tokens: MAX_TOKENS,
      reasoning: { effort: "low" },
      tools: definitions,
      input,
    });
    const cached = response.usage?.input_tokens_details?.cached_tokens ?? 0;
    usage.input += (response.usage?.input_tokens ?? 0) - cached;
    usage.cacheRead += cached;
    usage.output += response.usage?.output_tokens ?? 0;
    onUsage({ ...usage });

    const refused = response.output.some((item) => item.type === "message" && item.content.some((c) => c.type === "refusal"));
    if (refused || response.incomplete_details?.reason === "content_filter") return { text: null, refused: true };
    const calls = response.output.filter((item) => item.type === "function_call");
    if (!calls.length) return { text: response.output_text.trim() || null, refused: false };

    // Everything it produced goes back with the results: its reasoning has to stay with its calls.
    input.push(...(response.output as OpenAI.Responses.ResponseInputItem[]));
    for (const call of calls) {
      input.push({ type: "function_call_output", call_id: call.call_id, output: await runTool(tools, call.name, call.arguments) });
    }
  }
  return { text: null, refused: false };
}
