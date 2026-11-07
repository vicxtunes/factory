import "server-only";

import { z } from "zod";

import { accounting } from "@repo/lib/accounting/index.server";
import { addAgentClient } from "@repo/lib/agents/actions";
import { agentClients, agentOfClient, figuresFor } from "@repo/lib/agents/server";
import { createCustomer } from "@repo/lib/customers/actions";
import { customers } from "@repo/lib/customers/server";
import { agentClientSchema } from "@repo/lib/agents/core";
import { studioOfCaller } from "@repo/lib/studios/server";
import { canUse } from "@repo/lib/team/core";
import { vendorJobs, vendors } from "@repo/lib/vendors/server";

import { assistantTools } from "../../server/tools";
import type { Person } from "../server";
import { changeTool, outcome, readTool, type ChangeTool, type Toolbox } from "../toolbox";
import type { AssistantTool } from "../../server/tools";

// Alexis's tools in the client app: the account's own orders and money, and,
// on its business's pages, that studio's, agency's or vendor account's. Every
// tool finds the business from the sign-in (studioOfCaller, agentOfClient,
// vendors.mine), never from what the AI sends, and each change runs the same
// action the app's own button does.

/** The chat assistant's read-only tools, for the account's own orders, invoices, wallet and prices. */
const CLIENT_READS = ["get_catalog", "get_prices", "get_typical_times", "get_my_orders", "get_my_account", "get_my_receipts"];

function clientReads(person: Person): AssistantTool[] {
  const ctx = { conversationId: "", client: { id: person.id, name: person.name, email: person.email, phone: person.phone }, actions: [], choices: [], images: [] };
  return assistantTools(ctx).filter((t) => CLIENT_READS.includes(t.name));
}

const PERIODS = ["today", "yesterday", "this_week", "this_month", "last_month", "this_year", "all"] as const;

async function studioTools(): Promise<{ read: AssistantTool[]; change: ChangeTool[]; words: string } | null> {
  const caller = await studioOfCaller("anyone").catch(() => null);
  if (!caller) return null;
  const { scope, access, studio } = caller;
  const read: AssistantTool[] = [];
  const change: ChangeTool[] = [];
  const can: string[] = [];
  if (canUse(access, "money")) {
    read.push(
      readTool({
        name: "studio_money",
        description: "The studio's sales, payments received, what clients owe and what's overdue, for a period.",
        inputSchema: z.object({ period: z.enum(PERIODS) }),
        run: ({ period }) => accounting.overview(scope, { preset: period }),
      }),
    );
    can.push("see the studio's money");
  }
  if (canUse(access, "clients")) {
    read.push(
      readTool({
        name: "studio_clients",
        description: "The studio's clients: name, phone, email. Optionally only those whose name or phone contains some text.",
        inputSchema: z.object({ search: z.string().max(60).nullable() }),
        run: async ({ search }) => {
          const q = search?.trim().toLowerCase() ?? "";
          const list = await customers.list(scope);
          return list
            .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q))
            .slice(0, 30)
            .map((c) => ({ name: c.name, phone: c.phone, email: c.email }));
        },
      }),
    );
    change.push(
      changeTool({
        name: "add_studio_client",
        description: "Add a new client to the studio's client list.",
        // Plain fields (the module's own schema transforms, which the AI's tool format can't carry); createCustomer checks them.
        inputSchema: z.object({
          name: z.string().trim().min(1).max(120),
          phone: z.string().max(30).nullable(),
          email: z.string().max(120).nullable(),
          notes: z.string().max(2000).nullable(),
        }),
        card: async (c) => ({
          title: `Add ${c.name} to ${studio.name}'s clients`,
          lines: [c.phone ? `Phone: ${c.phone}` : "No phone", c.email ? `Email: ${c.email}` : "No email", ...(c.notes ? [`Notes: ${c.notes}`] : [])],
        }),
        run: async (c) => {
          const res = await createCustomer({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", notes: c.notes ?? "" });
          if (res.ok && "duplicateOf" in res.data) return { ok: false, error: `${res.data.duplicateOf.name} already has that phone number.` };
          return outcome(res, `${c.name} is now in your clients.`);
        },
      }),
    );
    can.push("see and add the studio's clients");
  }
  if (canUse(access, "projects")) {
    read.push(
      readTool({
        name: "studio_vendor_jobs",
        description: "The studio's jobs and rentals with vendors, newest first.",
        inputSchema: z.object({}),
        run: async () => (await vendorJobs.forStudio(scope.tenantId)).slice(0, 20),
      }),
    );
    can.push("see the studio's vendor jobs");
  }
  return { read, change, words: can.length ? `For ${studio.name}: ${can.join(", ")}.` : "" };
}

async function agentTools(person: Person): Promise<{ read: AssistantTool[]; change: ChangeTool[]; words: string } | null> {
  const agent = await agentOfClient(person.id);
  if (!agent) return null;
  return {
    read: [
      readTool({
        name: "agent_figures",
        description: "The agent's orders, sales, commission earned and pending, balance and withdrawals, in UGX.",
        inputSchema: z.object({}),
        run: async () => {
          const { orders, ...figures } = await figuresFor(agent.id);
          return { ...figures, latestOrders: orders.slice(0, 15) };
        },
      }),
      readTool({
        name: "agent_clients",
        description: "The agent's clients.",
        inputSchema: z.object({}),
        run: async () => (await agentClients(agent.id)).slice(0, 50),
      }),
    ],
    change: [
      changeTool({
        name: "add_agent_client",
        description: "Add a client to the agent's list.",
        inputSchema: agentClientSchema,
        card: async (c) => ({ title: `Add ${c.name} to your clients`, lines: [`Phone: ${c.phone}`, c.email ? `Email: ${c.email}` : "No email"] }),
        run: async (c) => {
          const res = await addAgentClient(c);
          if (!res.ok) return { ok: false, error: res.error };
          return { ok: true, done: res.data?.pending ? `${c.name} is waiting for Aming to confirm them.` : `${c.name} is now in your clients.` };
        },
      }),
    ],
    words: "For their agent account: see their figures and clients, and add a client.",
  };
}

async function vendorTools(person: Person): Promise<{ read: AssistantTool[]; change: ChangeTool[]; words: string } | null> {
  const vendor = await vendors.mine(person.id);
  if (!vendor) return null;
  return {
    read: [
      readTool({
        name: "vendor_jobs",
        description: "The vendor's jobs and rentals from studios, newest first.",
        inputSchema: z.object({}),
        run: async () => (await vendorJobs.forVendor(person.id)).slice(0, 20),
      }),
    ],
    change: [],
    words: "For their vendor account: see their jobs.",
  };
}

/** The toolbox for a client-app account on this page. */
export async function clientAppToolbox(person: Person, page: string): Promise<Toolbox> {
  if (person.type !== "client") return { read: [], change: [], abilities: "Nothing in this app." };
  const under = (root: string) => page === root || page.startsWith(`${root}/`);
  const business = under("/studio") ? await studioTools() : under("/agents") ? await agentTools(person) : under("/vendors") ? await vendorTools(person) : null;
  return {
    read: [...clientReads(person), ...(business?.read ?? [])],
    change: business?.change ?? [],
    abilities: [
      "Look up their own Aming orders, invoices, receipts, wallet and Aming's prices.",
      business?.words ?? "",
      "Show them the way around the app.",
      business?.change.length ? "" : "They can't make changes through you on this page.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
