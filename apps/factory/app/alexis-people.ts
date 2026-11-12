import "server-only";

import { z } from "zod";

import { decideClientMatch, editAgent, mergeAgentClient, moveAgentClient, setAgentActive, setPayFirstForAll } from "@repo/lib/agents/actions";
import { agentById, allAgentClients, payFirstForAll, pendingClientMatches, waitingForPayFirst } from "@repo/lib/agents/server";
import { changeTool, outcome, readTool, type ChangeTool } from "@repo/lib/assistant/panel/toolbox";
import type { AssistantTool } from "@repo/lib/assistant/server/tools";
import { createAdminClient } from "@repo/lib/supabase/admin";
import type { AppRole } from "@repo/lib/types";
import { confirmDeposit, listPendingDeposits, listWallets, recordDeposit, rejectDeposit, resolveMoneyAlert } from "@repo/lib/wallet/actions";

import { deleteClient, updateClient } from "./dashboard/actions";
import { matchesSearch } from "@repo/lib/search";

// Clients, their wallets and agents through Alexis (2026-11-10), on cards that
// run the pages' own server actions. Wallet money only comes in here (a
// deposit received or confirmed); refunds and withdrawals stay on their pages.

const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A date as YYYY-MM-DD.");
const id = z.string().uuid();
const METHODS = ["cash", "bank_transfer", "mobile_money", "other"] as const;

async function clientRow(clientId: string) {
  const { data } = await createAdminClient().from("clients").select("id, name, phone, email").eq("id", clientId).maybeSingle<{ id: string; name: string; phone: string | null; email: string | null }>();
  if (!data) throw new Error("That client doesn't exist. Look them up with find_clients.");
  return data;
}

async function agentRow(agentId: string) {
  const agent = await agentById(agentId);
  if (!agent) throw new Error("That agent doesn't exist. Look them up with agents.");
  return agent;
}

async function pendingDeposit(paymentId: string) {
  const res = await listPendingDeposits();
  const d = res.ok ? res.data.find((p) => p.id === paymentId) : null;
  if (!d) throw new Error("That deposit isn't waiting any more. Look again with pending_deposits.");
  return d;
}

const waitingWords = { follow: "orders already waiting take the new %", keep: "orders already waiting keep the % they had" };

function managerTools(): { read: AssistantTool[]; change: ChangeTool[] } {
  return {
    read: [
      readTool({
        name: "client_wallets",
        description: "Clients' wallets: client id, name, phone, balance in UGX and deposits waiting to be confirmed. Search by name or phone.",
        inputSchema: z.object({ search: z.string().max(60).nullable() }),
        run: async ({ search }) => {
          const res = await listWallets();
          if (!res.ok) return res.error;
          const rows = res.data.filter((w) => matchesSearch(search ?? "", [w.clientName, w.phone]));
          return { count: rows.length, total: rows.reduce((s, w) => s + w.balance, 0), wallets: rows.slice(0, 100) };
        },
      }),
      readTool({
        name: "pending_deposits",
        description: "Deposits clients say they've made (bank, mobile money to the business number…) waiting for staff to confirm they arrived: id, client, amount, method, reference, when.",
        inputSchema: z.object({}),
        run: async () => {
          const res = await listPendingDeposits();
          return res.ok ? res.data.map((d) => ({ id: d.id, client: d.clientName, phone: d.clientPhone, amount: d.amount, method: d.method, reference: d.reference, note: d.note, by: d.createdByName })) : res.error;
        },
      }),
      readTool({
        name: "client_matches",
        description: "Clients an agent added who look like someone already on Aming, waiting for staff to say whether they're the same person: id, the agent, what they entered, the client it matches.",
        inputSchema: z.object({}),
        run: pendingClientMatches,
      }),
    ],
    change: [
      changeTool({
        name: "edit_client",
        description: "Change a client's name, phone or email (give only what changes). Client id from find_clients.",
        inputSchema: z.object({ clientId: id, name: z.string().trim().min(1).max(100).nullable(), phone: z.string().trim().max(30).nullable(), email: z.string().trim().max(120).nullable() }),
        card: async (e) => {
          const c = await clientRow(e.clientId);
          const lines = [
            ...(e.name && e.name !== c.name ? [`Name: ${c.name} → ${e.name}`] : []),
            ...(e.phone != null && e.phone !== c.phone ? [`Phone: ${c.phone ?? "none"} → ${e.phone || "none"}`] : []),
            ...(e.email != null && e.email !== c.email ? [`Email: ${c.email ?? "none"} → ${e.email || "none"}`] : []),
          ];
          if (!lines.length) throw new Error("Nothing changes: say what should be different.");
          return { title: `Edit client ${c.name}`, lines };
        },
        run: async (e) => {
          const c = await clientRow(e.clientId);
          return outcome(await updateClient({ id: c.id, name: e.name ?? c.name, phone: e.phone ?? c.phone ?? "", email: e.email ?? c.email ?? "" }), "The client is updated.");
        },
      }),
      changeTool({
        name: "record_wallet_deposit",
        description: "Put money a client paid in (cash at the desk, bank, mobile money to the business number) on their wallet, with who sent it, when and into which account (money_accounts). Mobile money needs the sender's phone; bank the reference.",
        inputSchema: z.object({
          clientId: id,
          amount: z.number().int().positive(),
          method: z.enum(METHODS),
          senderName: z.string().trim().min(1).max(120),
          senderPhone: z.string().max(30).nullable(),
          reference: z.string().max(100).nullable(),
          receivedOn: day,
          accountId: id,
          note: z.string().max(500).nullable(),
        }),
        card: async (d) => {
          const c = await clientRow(d.clientId);
          const { data: account } = await createAdminClient().from("money_accounts").select("name").eq("id", d.accountId).maybeSingle();
          if (!account) throw new Error("That account doesn't exist. Look them up with money_accounts.");
          return { title: `Put ${ugx(d.amount)} on ${c.name}'s wallet`, lines: [`${d.method.replace("_", " ")} from ${d.senderName}${d.senderPhone ? ` (${d.senderPhone})` : ""}`, `Received ${d.receivedOn} into ${account.name}`, ...(d.reference ? [`Reference: ${d.reference}`] : [])] };
        },
        run: async (d) => {
          const res = await recordDeposit(d.clientId, { amount: d.amount, method: d.method, reference: d.reference, note: d.note, source: { senderName: d.senderName, senderPhone: d.senderPhone, receivedOn: d.receivedOn, accountId: d.accountId } });
          return res.ok ? { ok: true, done: `The wallet now holds ${ugx(res.data)}.` } : res;
        },
      }),
      changeTool({
        name: "confirm_deposit",
        description: "A deposit a client said they made has arrived: put it on their wallet. Id from pending_deposits.",
        inputSchema: z.object({ depositId: id }),
        card: async ({ depositId }) => {
          const d = await pendingDeposit(depositId);
          return { title: `Confirm ${ugx(d.amount)} from ${d.clientName}`, lines: [`${d.method.replace("_", " ")}${d.reference ? `, reference ${d.reference}` : ""}`, "It goes on their wallet"] };
        },
        run: async ({ depositId }) => {
          const res = await confirmDeposit(depositId);
          return res.ok ? { ok: true, done: `Confirmed: the wallet now holds ${ugx(res.data)}.` } : res;
        },
      }),
      changeTool({
        name: "reject_deposit",
        description: "A deposit a client said they made didn't arrive or doesn't match: refuse it, with the reason they'll see.",
        inputSchema: z.object({ depositId: id, reason: z.string().trim().min(3).max(300) }),
        card: async ({ depositId, reason }) => {
          const d = await pendingDeposit(depositId);
          return { title: `Refuse ${ugx(d.amount)} from ${d.clientName}`, lines: [`Reason: ${reason}`, "The client is told"] };
        },
        run: async ({ depositId, reason }) => outcome(await rejectDeposit(depositId, reason), "The deposit is refused."),
      }),
      changeTool({
        name: "decide_client_match",
        description: "Say whether a client an agent added is the same person already on Aming (approve: they're joined) or not. Id from client_matches.",
        inputSchema: z.object({ matchId: id, same: z.boolean() }),
        card: async ({ matchId, same }) => {
          const m = (await pendingClientMatches()).find((x) => x.id === matchId);
          if (!m) throw new Error("That match isn't waiting any more.");
          return { title: same ? `${m.enteredName} is ${m.clientName}` : `${m.enteredName} is someone new`, lines: [`Added by agent ${m.agentName}`, `Entered: ${[m.enteredPhone, m.enteredEmail].filter(Boolean).join(", ") || "no contacts"}`, `On Aming: ${m.clientName}, ${[m.clientPhone, m.clientEmail].filter(Boolean).join(", ") || "no contacts"}`] };
        },
        run: async ({ matchId, same }) => outcome(await decideClientMatch(matchId, same), same ? "They're joined." : "They're kept apart."),
      }),
    ],
  };
}

function bossTools(): { read: AssistantTool[]; change: ChangeTool[] } {
  return {
    read: [
      readTool({
        name: "agent_clients",
        description: "Everyone on any agent's list as they are on Aming: client id, agent id and name, name, phone, email, orders. Also the % agents pay before production for all agents.",
        inputSchema: z.object({ search: z.string().max(60).nullable() }),
        run: async ({ search }) => {
          const rows = (await allAgentClients()).filter((r) => matchesSearch(search ?? "", [r.name, r.phone, r.email, r.agentName]));
          return { payFirstForAll: await payFirstForAll(), count: rows.length, clients: rows.slice(0, 100) };
        },
      }),
    ],
    change: [
      changeTool({
        name: "delete_client",
        description: "Delete a client for good. Clients with orders can't be deleted. Only when asked to delete.",
        inputSchema: z.object({ clientId: id }),
        card: async ({ clientId }) => {
          const c = await clientRow(clientId);
          return { title: `Delete client ${c.name}`, lines: [[c.phone, c.email].filter(Boolean).join(", ") || "No contacts", "This can't be undone"] };
        },
        run: async ({ clientId }) => outcome(await deleteClient(clientId), "The client is deleted."),
      }),
      changeTool({
        name: "set_agent_active",
        description: "Stop an agent (they can't sign in or place orders) or let them back. Agent id from agents.",
        inputSchema: z.object({ agentId: id, active: z.boolean() }),
        card: async ({ agentId, active }) => {
          const a = await agentRow(agentId);
          if (a.active === active) throw new Error(`${a.name} is already ${active ? "active" : "stopped"}.`);
          return { title: `${active ? "Let" : "Stop"} agent ${a.name}${active ? " back" : ""}`, lines: [a.email ?? a.phone ?? ""] };
        },
        run: async ({ agentId, active }) => outcome(await setAgentActive(agentId, active), active ? "The agent is active again." : "The agent is stopped."),
      }),
      changeTool({
        name: "edit_agent",
        description:
          "Change an agent's name, their own commission % (rateOverride; null: the category rates) or their own %-to-pay-before-production (payFirstOverride; null: the setting for all agents). Give only what changes. Prepare it straight away with waiting null: only if the tool answers that orders are waiting, ask whether they take the new % (follow) or keep theirs (keep), then prepare it again with their answer.",
        inputSchema: z.object({
          agentId: id,
          name: z.string().trim().min(1).max(100).nullable(),
          rateOverride: z.number().min(0).max(100).nullable().optional().describe("Leave out to keep it; null: the category rates."),
          payFirstOverride: z.number().int().min(0).max(100).nullable().optional().describe("Leave out to keep it; null: the setting for all agents."),
          waiting: z.enum(["follow", "keep"]).nullable(),
        }),
        card: async (e) => {
          const a = await agentRow(e.agentId);
          const lines = [
            ...(e.name && e.name !== a.name ? [`Name: ${a.name} → ${e.name}`] : []),
            ...(e.rateOverride !== undefined && e.rateOverride !== a.rateOverride ? [`Commission: ${a.rateOverride == null ? "category rates" : `${a.rateOverride}%`} → ${e.rateOverride == null ? "category rates" : `${e.rateOverride}%`}`] : []),
            ...(e.payFirstOverride !== undefined && e.payFirstOverride !== a.payFirstOverride ? [`Pay before production: ${a.payFirstOverride == null ? "the all-agents %" : `${a.payFirstOverride}%`} → ${e.payFirstOverride == null ? "the all-agents %" : `${e.payFirstOverride}%`}`] : []),
          ];
          if (!lines.length) throw new Error("Nothing changes: say what should be different.");
          if (e.payFirstOverride !== undefined && e.payFirstOverride !== a.payFirstOverride) {
            const w = await waitingForPayFirst(a.id);
            if (w.count && !e.waiting) throw new Error(`${w.count} of ${a.name}'s orders are waiting (${w.orderNos.join(", ")}): ask whether they take the new % or keep theirs.`);
            if (w.count && e.waiting) lines.push(`${w.count} waiting: ${waitingWords[e.waiting]}`);
          }
          return { title: `Edit agent ${a.name}`, lines };
        },
        run: async (e) => {
          const a = await agentRow(e.agentId);
          return outcome(
            await editAgent({ agentId: a.id, name: e.name ?? a.name, rateOverride: e.rateOverride === undefined ? a.rateOverride : e.rateOverride, payFirstOverride: e.payFirstOverride === undefined ? a.payFirstOverride : e.payFirstOverride }, e.waiting ?? "follow"),
            "The agent is updated.",
          );
        },
      }),
      changeTool({
        name: "set_pay_first_for_all",
        description: "The % every agent's own orders must have paid before production (agents with their own % keep it). Prepare it straight away with waiting null: only if the tool answers that orders are waiting, ask whether they take the new % (follow) or keep theirs (keep), then prepare it again with their answer.",
        inputSchema: z.object({ percent: z.number().int().min(0).max(100), waiting: z.enum(["follow", "keep"]).nullable() }),
        card: async ({ percent, waiting }) => {
          const [now, w] = await Promise.all([payFirstForAll(), waitingForPayFirst(null)]);
          if (w.count && !waiting) throw new Error(`${w.count} agent orders are waiting (${w.orderNos.join(", ")}): ask whether they take the new % or keep theirs.`);
          return { title: `Agents pay ${percent}% before production`, lines: [`Now: ${now}%`, ...(w.count && waiting ? [`${w.count} waiting: ${waitingWords[waiting]}`] : [])] };
        },
        run: async ({ percent, waiting }) => outcome(await setPayFirstForAll(percent, waiting ?? "follow"), `Agents now pay ${percent}% before production.`),
      }),
      changeTool({
        name: "move_agent_client",
        description: "Move a client from one agent's list to another agent's. Client and agent ids from agent_clients and agents.",
        inputSchema: z.object({ clientId: id, toAgentId: id }),
        card: async ({ clientId, toAgentId }) => {
          const [c, to] = await Promise.all([clientRow(clientId), agentRow(toAgentId)]);
          const now = (await allAgentClients()).find((r) => r.clientId === clientId)?.agentName;
          return { title: `Move ${c.name} to ${to.name}`, lines: [`Now with: ${now ?? "no agent"}`] };
        },
        run: async ({ clientId, toAgentId }) => outcome(await moveAgentClient(clientId, toAgentId), "The client is moved."),
      }),
      changeTool({
        name: "merge_agent_client",
        description: "An agent's client is really someone already on Aming: join them into that client (their orders and wallet follow). from: the agent's client; into: the client on Aming (find_clients).",
        inputSchema: z.object({ fromClientId: id, intoClientId: id }),
        card: async ({ fromClientId, intoClientId }) => {
          if (fromClientId === intoClientId) throw new Error("Those are the same client.");
          const [from, into] = await Promise.all([clientRow(fromClientId), clientRow(intoClientId)]);
          return { title: `Join ${from.name} into ${into.name}`, lines: [`${from.name}: ${[from.phone, from.email].filter(Boolean).join(", ") || "no contacts"}`, `${into.name}: ${[into.phone, into.email].filter(Boolean).join(", ") || "no contacts"}`, "This can't be undone"] };
        },
        run: async ({ fromClientId, intoClientId }) => outcome(await mergeAgentClient(fromClientId, intoClientId), "The clients are joined."),
      }),
    ],
  };
}

/** For whoever is signed in to the staff app: managers, the boss on top, money alerts for Accounts. */
export function peopleTools(role: AppRole, accounts: boolean): { read: AssistantTool[]; change: ChangeTool[] } {
  const m = managerTools();
  const b = role === "boss" ? bossTools() : { read: [], change: [] };
  const alerts: ChangeTool[] = accounts
    ? [
        changeTool({
          name: "resolve_money_alert",
          description: "Mark a money watch alert (from server_health) as dealt with.",
          inputSchema: z.object({ alertId: id }),
          card: async ({ alertId }) => {
            const { data } = await createAdminClient().from("money_alerts").select("amount, detail, resolved_at").eq("id", alertId).maybeSingle();
            if (!data) throw new Error("That alert doesn't exist.");
            if (data.resolved_at) throw new Error("That alert is already dealt with.");
            return { title: `Mark the ${ugx(Number(data.amount))} alert as dealt with`, lines: [String(data.detail)] };
          },
          run: async ({ alertId }) => outcome(await resolveMoneyAlert(alertId), "The alert is dealt with."),
        }),
      ]
    : [];
  return { read: [...m.read, ...b.read], change: [...m.change, ...b.change, ...alerts] };
}
