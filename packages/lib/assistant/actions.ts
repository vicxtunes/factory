"use server";

import { revalidatePath } from "next/cache";

import { getDashboardSession, requireRole } from "@repo/lib/auth/session";
import { isManagerRole } from "@repo/lib/types";

import type { AssistantMode } from "./core/rules";
import * as store from "./server/store";

export async function saveAssistantSettings(input: { mode: AssistantMode; dailyCapUsd: number; testClients: string }): Promise<{ ok: boolean; error?: string }> {
  await requireRole("boss");
  if (!["off", "test", "live"].includes(input.mode)) return { ok: false, error: "Choose a mode." };
  if (!Number.isFinite(input.dailyCapUsd) || input.dailyCapUsd < 0) return { ok: false, error: "Enter a valid daily limit." };
  await store.saveSettings({ mode: input.mode, dailyCapUsd: input.dailyCapUsd, testClients: input.testClients.slice(0, 2000) });
  revalidatePath("/dashboard/assistant");
  return { ok: true };
}

async function requireManager(): Promise<boolean> {
  const session = await getDashboardSession();
  return !!session && isManagerRole(session.role);
}

/** Whether staff have taken this chat over from the assistant. */
export async function assistantIsQuiet(conversationId: string): Promise<boolean> {
  if (!(await requireManager())) return false;
  return (await store.threadState(conversationId)) === "staff";
}

export async function handBackToAssistant(conversationId: string): Promise<void> {
  if (!(await requireManager())) return;
  await store.setState(conversationId, "active");
}
