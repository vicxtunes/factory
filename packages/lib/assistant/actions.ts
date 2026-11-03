"use server";

import { revalidatePath } from "next/cache";

import { getDashboardSession } from "@repo/lib/auth/session";
import { SUPPORT_OWNER_EMAIL } from "@repo/lib/support/constants";
import { isManagerRole } from "@repo/lib/types";

import { findModel, type AssistantMode } from "./core/rules";
import * as store from "./server/store";

export async function saveAssistantSettings(input: { mode: AssistantMode; dailyCapUsd: number; testClients: string }): Promise<{ ok: boolean; error?: string }> {
  const session = await getDashboardSession();
  if (session?.role !== "boss" && session?.email !== SUPPORT_OWNER_EMAIL) return { ok: false, error: "You don't have access to this." };
  if (!["off", "test", "live"].includes(input.mode)) return { ok: false, error: "Choose a mode." };
  if (!Number.isFinite(input.dailyCapUsd) || input.dailyCapUsd < 0) return { ok: false, error: "Enter a valid daily limit." };
  await store.saveSettings({ mode: input.mode, dailyCapUsd: input.dailyCapUsd, testClients: input.testClients.slice(0, 2000) });
  revalidatePath("/dashboard/assistant");
  return { ok: true };
}

/** Which AI answers is the developer's choice alone. */
export async function saveAssistantModel(model: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getDashboardSession();
  if (session?.email !== SUPPORT_OWNER_EMAIL) return { ok: false, error: "You don't have access to this." };
  if (!findModel(model)) return { ok: false, error: "Choose a model." };
  await store.saveModel(model);
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
