import "server-only";

import { z } from "zod";

import { createAdminClient } from "@repo/lib/supabase/admin";

import type { AssistantTool } from "../server/tools";
import type { Person } from "./server";
import { readTool } from "./toolbox";

// What Alexis keeps about a person across chats: their preferences, their
// business, and an order they started and didn't finish. It's given to Alexis
// with every message, and the person sees and deletes each one in the Usage tab.

export type MemoryKind = "preference" | "business" | "unfinished_order";

export interface Memory {
  id: string;
  kind: MemoryKind;
  fact: string;
  updatedAt: string;
}

/** Kept per person; past it, the oldest of the same kind makes room. */
export const MAX_MEMORIES = 40;

function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

const table = () => createAdminClient().from("assistant_memories");

export async function memoriesOf(person: Person): Promise<Memory[]> {
  const rows = must(
    await table().select("id, kind, fact, updated_at").eq("person_type", person.type).eq("person_id", person.id).order("updated_at", { ascending: false }).limit(MAX_MEMORIES),
  ) as { id: string; kind: MemoryKind; fact: string; updated_at: string }[];
  return rows.map((r) => ({ id: r.id, kind: r.kind, fact: r.fact, updatedAt: r.updated_at }));
}

export async function remember(person: Person, kind: MemoryKind, fact: string): Promise<void> {
  const text = fact.replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!text) return;
  const all = await memoriesOf(person);
  const same = all.find((m) => m.kind === kind && m.fact.toLowerCase() === text.toLowerCase());
  if (same) {
    must(await table().update({ updated_at: new Date().toISOString() }).eq("id", same.id));
    return;
  }
  if (all.length >= MAX_MEMORIES) {
    const oldest = [...all].reverse().find((m) => m.kind === kind) ?? all.at(-1)!;
    must(await table().delete().eq("id", oldest.id));
  }
  must(await table().insert({ person_type: person.type, person_id: person.id, kind, fact: text }));
}

/** One memory, if it's this person's. */
export async function forget(person: Person, id: string): Promise<boolean> {
  const rows = must(await table().delete().eq("id", id).eq("person_type", person.type).eq("person_id", person.id).select("id")) as { id: string }[];
  return rows.length > 0;
}

export async function forgetKind(person: Person, kind: MemoryKind): Promise<void> {
  must(await table().delete().eq("person_type", person.type).eq("person_id", person.id).eq("kind", kind));
}

const KIND_WORDS: Record<MemoryKind, string> = {
  preference: "Preference",
  business: "About their business",
  unfinished_order: "Unfinished order",
};

/** For Alexis's context: what it remembers, with ids so it can forget one. */
export function memoriesForModel(memories: Memory[]): string {
  if (!memories.length) return "";
  return `What you remember about them from earlier chats (use it, don't recite it): ${memories.map((m) => `[${m.id}] ${KIND_WORDS[m.kind]}: ${m.fact}`).join("; ")}.`;
}

/** Remembering and forgetting, as Alexis's tools. Nothing secret: no passwords, PINs, card or ID numbers. */
export function memoryTools(person: Person): AssistantTool[] {
  return [
    readTool({
      name: "remember",
      description:
        "Keep something useful about this person for future chats: a preference (usual sizes, finishes, colours, language, how they like to pay or collect), a fact about their business (what they sell, who their clients are, their prices, their goals), or an order they started and didn't finish (every choice they made, so it can be placed later). One short fact each. Never passwords, PINs, card or ID numbers, or anything they ask you not to keep.",
      inputSchema: z.object({ kind: z.enum(["preference", "business", "unfinished_order"]), fact: z.string().min(1).max(1000) }),
      run: async ({ kind, fact }) => {
        if (/\b(password|pin|cvv|card number)\b/i.test(fact)) return "Refused: that looks secret. Don't keep it.";
        await remember(person, kind, fact);
        return "Kept. Don't mention it unless they ask.";
      },
    }),
    readTool({
      name: "forget",
      description: "Forget one thing you remember about them (by its id in brackets): when it's wrong, out of date, done (an unfinished order now placed), or they ask.",
      inputSchema: z.object({ id: z.string() }),
      run: async ({ id }) => ((await forget(person, id)) ? "Forgotten." : "Refused: there's nothing with that id."),
    }),
  ];
}
