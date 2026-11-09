import "server-only";

import { z } from "zod";

import type { AssistantTool } from "../server/tools";

// What Alexis can use for one person: tools that read, and changes it can only
// prepare. Each app builds the toolbox for whoever is signed in, from functions
// that already check who may do what (its own server actions, or a module's).
// A change runs the same function the app's own button runs, and only when
// the person taps Confirm.

/** A read tool: runs straight away and returns facts for Alexis. */
export function readTool<S extends z.ZodType>(t: { name: string; description: string; inputSchema: S; run: (input: z.infer<S>) => Promise<unknown> }): AssistantTool {
  return {
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    run: (async (input: z.infer<S>) => {
      const out = await t.run(input);
      return typeof out === "string" ? out : JSON.stringify(out);
    }) as AssistantTool["run"],
  };
}

/** `uploadItemId`: once done, the files the person attached upload to this order item from their device. */
export type ChangeOutcome = { ok: true; done: string; uploadItemId?: string } | { ok: false; error: string };

/** What a card knows besides its input: how many files are attached to the person's latest message. */
export interface CardContext {
  attached: number;
}

export interface ChangeTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  /** What the card shows. May look things up (a name for an id); throws with a sentence when it can't be done. */
  card: (input: never, ctx: CardContext) => Promise<{ title: string; lines: string[] }>;
  /** Runs the change through the app's own guarded function. Called only from Confirm. */
  run: (input: never) => Promise<ChangeOutcome>;
  /** For a change that adds the attached files to an order item: that item. Once confirmed, the person's device uploads them there. */
  uploadsTo?: (input: never) => string;
}

export function changeTool<S extends z.ZodType>(t: {
  name: string;
  description: string;
  inputSchema: S;
  card: (input: z.infer<S>, ctx: CardContext) => Promise<{ title: string; lines: string[] }>;
  run: (input: z.infer<S>) => Promise<ChangeOutcome>;
  uploadsTo?: (input: z.infer<S>) => string;
}): ChangeTool {
  return t as unknown as ChangeTool;
}

/** A guarded function's { ok, error } as a change's outcome. */
export function outcome(res: { ok: boolean; error?: string }, done: string): ChangeOutcome {
  return res.ok ? { ok: true, done } : { ok: false, error: res.error ?? "It couldn't be done." };
}

/** Something the app shows under a reply for the person to use themselves: the studio's logo uploader, or one service's photos panel. */
export type ReplyWidget = "logo" | `service-media:${string}`;

export interface Toolbox {
  read: AssistantTool[];
  change: ChangeTool[];
  /** In words for Alexis: what this person can and can't do through it. */
  abilities: string;
  /** Tappable answers and product photos the tools put under the reply (the chat assistant's offer_choices and show_product_photos). */
  replyExtras?: () => { choices: string[]; images: { url: string; name: string }[]; widgets?: ReplyWidget[] };
}

/** A link on the page the person has open: where Alexis may send them. */
export interface PageLink {
  href: string;
  label: string;
}

export const pageLinksSchema = z
  .array(z.object({ href: z.string().max(300), label: z.string().max(80) }))
  .max(120)
  .catch([]);

export interface GuideStep {
  href: string;
  /** The words on the button or link to tap once there. */
  tap: string | null;
  say: string;
}

export const MAX_GUIDE_STEPS = 5;
