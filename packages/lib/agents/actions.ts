"use server";

// The agent platform's actions: the signed-in agent's, and staff's.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getClientSession, getDashboardSession, sessionCan } from "@repo/lib/auth/session";
import { AppError, parseInput, type Result } from "@repo/lib/kernel/core";
import { runAction } from "@repo/lib/kernel/server/action";
import type { OrderItemInput } from "@repo/lib/orders/types";
import type { OrderType } from "@repo/lib/types";
import { WalletError, checkOrderLinkPayment, startOrderLinkPayment } from "@repo/lib/wallet/orders";
import type { MobileMoneyCollection } from "@repo/lib/wallet/types";

import { agentClientSchema, agentEditSchema, agentRegisterSchema, commissionRateSchema, payFirstPercentSchema, waitingChoiceSchema, weeklyPaySchema } from "./core";
import * as server from "./server";

const id = z.string().uuid();

/** The signed-in agent, or a refusal. */
async function requireAgent(): Promise<server.Agent> {
  const session = await getClientSession();
  const agent = session ? await server.agentOfClient(session.client_id) : null;
  if (!agent) throw new AppError("Sign in as an agent first.");
  return agent;
}

/** Registering, editing and paying agents, their rates and clients: Agents at manage. */
async function requireBoss(): Promise<string> {
  const session = await getDashboardSession();
  if (!sessionCan(session, "agents", "manage")) throw new AppError("You don't have access to this. Ask the boss.");
  return session.fullName || session.email || "Staff";
}

/** Whether an agent's client is someone already on Aming: Clients at manage. */
async function requireManagerName(): Promise<string> {
  const session = await getDashboardSession();
  if (!sessionCan(session, "clients", "manage")) throw new AppError("You don't have access to this. Ask the boss.");
  return session.fullName || session.email || "Staff";
}

/** A wallet refusal reaches the browser with its message, as any other expected failure. */
async function readably<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof WalletError) throw new AppError(err.message);
    throw err;
  }
}

// --- The agent ---------------------------------------------------------------------

export type AgentPlaceResult =
  | { ok: true; orderId: string; orderNo: string; items: { formIndex: number; itemId: string }[]; warnings: string[]; promoApplied: boolean }
  | { ok: false; error: string };

/** The agent's order for one of their clients (bound to the client by the page). */
export async function placeAgentOrder(
  clientId: string,
  input: { order_type: OrderType; delivery_date: string; order_notes: string; items: OrderItemInput[] },
): Promise<AgentPlaceResult> {
  const res = await runAction("agents", async () => {
    const placed = await server.placeForClient(await requireAgent(), { ...input, clientId: id.parse(clientId) });
    revalidatePath("/agents", "layout");
    return placed;
  });
  if (!res.ok) return res;
  const { orderId, orderNo, items } = res.data!;
  return { ok: true, orderId, orderNo, items, warnings: [], promoApplied: false };
}

export async function addAgentClient(input: unknown): Promise<Result<{ pending: boolean }>> {
  return runAction("agents", async () => {
    const pending = await server.addClient(await requireAgent(), parseInput(agentClientSchema, input));
    revalidatePath("/agents", "layout");
    return pending;
  });
}

export async function editAgentClient(clientId: unknown, input: unknown): Promise<Result> {
  return runAction("agents", async () => {
    await server.editClient(await requireAgent(), parseInput(id, clientId), parseInput(agentClientSchema, input));
    revalidatePath("/agents", "layout");
  });
}

/** A mobile money prompt to the client's phone for what's still due on the agent's order. The money goes straight to Aming. */
export async function promptClientToPay(orderId: unknown, phone: unknown): Promise<Result<MobileMoneyCollection>> {
  return runAction("agents", async () => {
    const agent = await requireAgent();
    const order = await server.agentOrder(agent.id, parseInput(id, orderId));
    if (!order) throw new AppError("Order not found.");
    return readably(() => startOrderLinkPayment({ orderId: order.id, phone: parseInput(z.string().trim().min(1, "Enter the client's phone number."), phone) }));
  });
}

/** How that prompt went. The id is the collection's, which only the page that started it has. */
export async function checkClientPayment(collectionId: unknown): Promise<Result<MobileMoneyCollection>> {
  return runAction("agents", async () => {
    await requireAgent();
    return readably(() => checkOrderLinkPayment(parseInput(id, collectionId)));
  });
}

// --- The boss -------------------------------------------------------------------------

function refreshAdmin() {
  revalidatePath("/dashboard/agents", "layout");
}

export async function registerAgent(input: unknown): Promise<Result> {
  return runAction("agents", async () => {
    await requireBoss();
    await server.registerAgent(parseInput(agentRegisterSchema, input));
    refreshAdmin();
  });
}

/** `waiting`: if their % changes, whether their orders already waiting take the new one ("follow") or keep theirs ("keep"). */
export async function editAgent(input: unknown, waiting: unknown = "follow"): Promise<Result> {
  return runAction("agents", async () => {
    await requireBoss();
    await server.editAgent(parseInput(agentEditSchema, input), parseInput(waitingChoiceSchema, waiting));
    refreshAdmin();
  });
}

export async function setAgentActive(agentId: unknown, active: unknown): Promise<Result> {
  return runAction("agents", async () => {
    await requireBoss();
    await server.setAgentActive(parseInput(id, agentId), parseInput(z.boolean(), active));
    refreshAdmin();
  });
}

export async function setCommissionRate(input: unknown): Promise<Result> {
  return runAction("agents", async () => {
    const by = await requireBoss();
    const { categoryId, rate } = parseInput(commissionRateSchema, input);
    await server.setCategoryRate(categoryId, rate, by);
    refreshAdmin();
  });
}

/** Agents' commission paid by itself every week: on or off, the day, the hour and the smallest amount. */
export async function setWeeklyPay(input: unknown): Promise<Result> {
  return runAction("agents", async () => {
    const by = await requireBoss();
    await server.setWeeklyPay(parseInput(weeklyPaySchema, input), by);
    refreshAdmin();
  });
}

/** `waiting`: whether orders already waiting take the new % ("follow") or keep theirs ("keep"). */
export async function setPayFirstForAll(percent: unknown, waiting: unknown = "follow"): Promise<Result> {
  return runAction("agents", async () => {
    const by = await requireBoss();
    await server.setPayFirstForAll(parseInput(payFirstPercentSchema, percent), by, parseInput(waitingChoiceSchema, waiting));
    refreshAdmin();
  });
}

/** Before saving a new %: how many agent orders are waiting under that rule (one agent's, or all agents'). */
export async function waitingForPayFirst(agentId: unknown): Promise<Result<{ count: number; orderNos: string[] }>> {
  return runAction("agents", async () => {
    await requireBoss();
    return server.waitingForPayFirst(agentId == null ? null : parseInput(id, agentId));
  });
}

/** Clients on Aming that an agent's client could be, for the merge sheet. */
export async function findMergeTargets(fromClientId: unknown, query: unknown): Promise<Result<server.MergeTarget[]>> {
  return runAction("agents", async () => {
    await requireBoss();
    return server.mergeTargets(parseInput(id, fromClientId), parseInput(z.string().max(200), query));
  });
}

export async function mergeAgentClient(fromClientId: unknown, intoClientId: unknown): Promise<Result> {
  return runAction("agents", async () => {
    const by = await requireBoss();
    await server.mergeAgentClient(parseInput(id, fromClientId), parseInput(id, intoClientId), by);
    refreshAdmin();
    revalidatePath("/dashboard/clients");
  });
}

export async function moveAgentClient(clientId: unknown, toAgentId: unknown): Promise<Result> {
  return runAction("agents", async () => {
    const by = await requireBoss();
    await server.moveAgentClient(parseInput(id, clientId), parseInput(id, toAgentId), by);
    refreshAdmin();
  });
}

// --- Staff ------------------------------------------------------------------------------

export async function decideClientMatch(matchId: unknown, approve: unknown): Promise<Result> {
  return runAction("agents", async () => {
    const by = await requireManagerName();
    await server.decideClientMatch(parseInput(id, matchId), parseInput(z.boolean(), approve), by);
    refreshAdmin();
  });
}
