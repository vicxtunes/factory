"use server";

import { revalidatePath } from "next/cache";

import { getDashboardSession } from "@repo/lib/auth/session";
import { SUPPORT_OWNER_EMAIL } from "@repo/lib/support/constants";

import type { AssistantMode } from "../core/rules";
import * as panel from "./server";

const OFF: panel.PanelState = { kind: "off" };

/** What the panel shows this person on this page: off, terms to agree to, or their chat and usage. */
export async function openAlexis(page: string): Promise<panel.PanelState> {
  const person = await panel.currentPerson();
  return person ? panel.panelState(person, page) : OFF;
}

export async function agreeToAlexisTerms(version: number, page: string): Promise<panel.PanelState> {
  const person = await panel.currentPerson();
  if (!person) return OFF;
  await panel.agreeToTerms(person, version);
  return panel.panelState(person, page);
}

export async function askAlexis(text: string, page: { path: string; title: string }): Promise<panel.SendResult> {
  const person = await panel.currentPerson();
  if (!person) return { ok: false, error: "Sign in to use Alexis." };
  return panel.send(person, String(text), { path: String(page.path).slice(0, 300), title: String(page.title).slice(0, 120) });
}

async function bossOrDeveloper(): Promise<string | null> {
  const session = await getDashboardSession();
  if (session?.role !== "boss" && session?.email !== SUPPORT_OWNER_EMAIL) return null;
  return session.fullName || session.email || "Boss";
}

export async function saveAlexisPanelSettings(input: { panelMode: AssistantMode; multiplier: number; monthlyCapUsd: number }): Promise<{ ok: boolean; error?: string }> {
  if (!(await bossOrDeveloper())) return { ok: false, error: "You don't have access to this." };
  if (!["off", "test", "live"].includes(input.panelMode)) return { ok: false, error: "Choose a mode." };
  if (!Number.isFinite(input.multiplier) || input.multiplier < 1 || input.multiplier > 100) return { ok: false, error: "The price must be at least 1× the AI cost." };
  if (!Number.isFinite(input.monthlyCapUsd) || input.monthlyCapUsd < 0) return { ok: false, error: "Enter a valid monthly limit." };
  await panel.savePanelSettings(input);
  revalidatePath("/dashboard/assistant");
  return { ok: true };
}

export async function publishAlexisTerms(body: string): Promise<{ ok: boolean; error?: string; version?: number }> {
  const by = await bossOrDeveloper();
  if (!by) return { ok: false, error: "You don't have access to this." };
  const text = String(body).trim();
  if (text.length < 50) return { ok: false, error: "Paste the full terms." };
  if (text.length > 50_000) return { ok: false, error: "The terms are too long." };
  const version = await panel.publishTerms(text, by);
  revalidatePath("/dashboard/assistant");
  return { ok: true, version };
}
