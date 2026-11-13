import "server-only";

import { z } from "zod";

import { accounting } from "@repo/lib/accounting/index.server";
import { addAgentClient, editAgentClient, promptClientToPay } from "@repo/lib/agents/actions";
import { agentClients, agentOfClient, figuresFor } from "@repo/lib/agents/server";
import { createCustomer } from "@repo/lib/customers/actions";
import { customers } from "@repo/lib/customers/server";
import { agentClientSchema } from "@repo/lib/agents/core";
import { ownStudio, studioOfCaller, studiosOf } from "@repo/lib/studios/server";
import { canUse } from "@repo/lib/team/core";
import { vendorJobs, vendors } from "@repo/lib/vendors/server";

import { assistantTools, tellManagers, type ToolContext } from "../../server/tools";
import { createAdminClient } from "@repo/lib/supabase/admin";
import type { Person } from "../server";
import { changeTool, outcome, readTool, type ChangeTool, type Toolbox } from "../toolbox";
import { cancellationTool, clientOrderTools, explainPriceTool, walletTools } from "./client-orders";
import { addFilesToOrderTool } from "./order-files";
import { studioBusinessTools } from "./studio-business";
import { studioJobChanges, vendorJobChanges } from "./vendor-jobs";
import { studioSetupTools } from "./studio-setup";
import { marketPricesTool, packagePhotosTool, studioDocumentTool } from "./studio-work";

/** What the studio's tools show under a reply: the logo uploader, and a service's photos panel. */
interface Widgets {
  logo: boolean;
  serviceMedia: string | null;
}
import type { AssistantTool } from "../../server/tools";

// Alexis's tools in the client app: the account's own orders and money, and,
// on its business's pages, that studio's, agency's or vendor account's. Every
// tool finds the business from the sign-in (studioOfCaller, agentOfClient,
// vendors.mine), never from what the AI sends, and each change runs the same
// action the app's own button does.

/**
 * The chat assistant's own tools that don't belong to a chat thread: the account's orders, invoices, wallet,
 * prices and pay options, and the product photos it puts under a reply. (Options to tap are the panel's own
 * offer_choices, shown above the message box.) Ordering,
 * invoicing and payment prompts are cards here (./client-orders.ts), and so are photos (./order-files.ts).
 */
const FROM_CHAT = ["get_catalog", "get_prices", "get_typical_times", "get_my_orders", "get_my_account", "get_my_receipts", "get_pay_options", "show_product_photos"];

function fromChat(person: Person) {
  const ctx: ToolContext = { conversationId: "", client: { id: person.id, name: person.name, email: person.email, phone: person.phone }, actions: [], choices: [], images: [] };
  return { tools: assistantTools(ctx).filter((t) => FROM_CHAT.includes(t.name)), extras: () => ({ choices: ctx.choices, images: ctx.images }) };
}

/** The chat's hand_to_staff, without a chat thread: the team is told, at most once an hour per account. */
function handToStaff(person: Person): AssistantTool {
  return readTool({
    name: "hand_to_staff",
    description: "Tell the team this client needs a person (a question you can't answer, a complaint, a large or unusual order). Keep helping with anything else.",
    inputSchema: z.object({ reason: z.string().max(500) }),
    run: async ({ reason }) => {
      const { count } = await createAdminClient()
        .from("assistant_runs")
        .select("id", { count: "exact", head: true })
        .eq("person_type", "client")
        .eq("person_id", person.id)
        .contains("actions", ["Asked staff"])
        .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString());
      if ((count ?? 0) > 0) return "The team was already told a short while ago. Carry on helping.";
      await tellManagers(`${person.name} needs a person`, `Through Alexis: ${reason}`, "/dashboard/clients");
      await createAdminClient().from("assistant_runs").insert({ person_type: "client", person_id: person.id, actions: ["Asked staff"], reply: null });
      return "The team has been told. Say someone from the team will contact them (in Chat or by phone), and keep helping until then.";
    },
  });
}

const PERIODS = ["today", "yesterday", "this_week", "this_month", "last_month", "this_year", "all"] as const;

/**
 * On /studio pages. An open studio: what the person's team areas allow, and for the owner its page too.
 * The owner's studio while it's being set up (studioOfCaller refuses it until Aming approves): setting up its page.
 */
async function studioTools(widgets: Widgets): Promise<{ read: AssistantTool[]; change: ChangeTool[]; words: string } | null> {
  const caller = await studioOfCaller("anyone").catch(() => null);
  if (!caller) {
    const settingUp = await ownStudio().catch(() => null);
    return settingUp ? studioSetupTools(settingUp, widgets) : null;
  }
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
    if (canUse(access, "money", "manage")) change.push(studioDocumentTool(scope));
    can.push(canUse(access, "money", "manage") ? "see the studio's money and create quotations and invoices for its clients" : "see the studio's money");
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
            .map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }));
        },
      }),
    );
    if (canUse(access, "clients", "manage")) change.push(
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
    can.push(canUse(access, "clients", "manage") ? "see and add the studio's clients" : "see the studio's clients");
  }
  if (canUse(access, "catalog")) {
    read.push(packagePhotosTool(scope, widgets), marketPricesTool(scope));
    can.push("add photos to its packages, and say what other studios on Aming charge (a range, no names)");
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
  const work = studioBusinessTools(scope, (area) => canUse(access, area), (area) => canUse(access, area, "manage"));
  read.push(...work.read);
  change.push(...work.change);
  can.push(...work.words);
  const jobs = studioJobChanges(scope.tenantId, { projects: canUse(access, "projects", "manage"), money: canUse(access, "money", "manage") });
  change.push(...jobs);
  if (jobs.length) can.push("call off, pay in, approve or raise a problem with vendor jobs");
  const words = can.length ? `For ${studio.name}: ${can.join(", ")}.` : "";
  if (!access.owner) return { read, change, words };
  const page = studioSetupTools(caller, widgets);
  return { read: [...read, ...page.read], change: [...change, ...page.change], words: `${words} ${page.words}` };
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
      changeTool({
        name: "edit_agent_client",
        description: "Change a client's name, phone or email on the agent's list (give all three, keeping what doesn't change). Use clientId from agent_clients. Clients who sign in themselves change their own details.",
        inputSchema: agentClientSchema.extend({ clientId: z.string().uuid() }),
        card: async ({ clientId, ...c }) => {
          const now = (await agentClients(agent.id)).find((x) => x.clientId === clientId);
          if (!now) throw new Error("That client isn't on your list.");
          if (now.locked) throw new Error(`${now.name} signs in to Aming: their details are theirs to change.`);
          return { title: `Edit ${now.name}`, lines: [`Name: ${c.name}`, `Phone: ${c.phone}`, c.email ? `Email: ${c.email}` : "No email"] };
        },
        run: async ({ clientId, ...c }) => {
          const res = await editAgentClient(clientId, c);
          return res.ok ? { ok: true, done: "The client is updated." } : { ok: false, error: res.error };
        },
      }),
      changeTool({
        name: "prompt_client_to_pay",
        description: "Send an MTN or Airtel prompt to a client's phone for what's still due on one of the agent's orders (order id from agent_figures). The money goes straight to Aming.",
        inputSchema: z.object({ orderId: z.string().uuid(), phone: z.string().trim().min(9).max(20) }),
        card: async ({ orderId, phone }) => {
          const o = (await figuresFor(agent.id)).orders.find((x) => x.id === orderId);
          if (!o) throw new Error("That order isn't yours.");
          const due = (o.price ?? 0) - o.paid;
          if (o.price != null && due <= 0) throw new Error(`Order ${o.orderNo} is paid.`);
          return { title: `Ask ${o.clientName} to pay order ${o.orderNo}`, lines: [`Prompt to ${phone}`, ...(o.price != null ? [`Due: UGX ${due.toLocaleString("en-UG")}`] : [])] };
        },
        run: async ({ orderId, phone }) => {
          const res = await promptClientToPay(orderId, phone);
          return res.ok ? { ok: true, done: "The prompt is on its way: the client approves it on their phone." } : { ok: false, error: res.error };
        },
      }),
    ],
    words: "For their agent account: see their figures and clients, add or change a client, and send a client a mobile money prompt for what's due on an order.",
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
    change: vendorJobChanges(person.id),
    words: "For their vendor account: see their jobs; accept or decline a request, say samples are ready, hand over or deliver, give up a job.",
  };
}

/** The toolbox for a client-app account on this page. */
/**
 * The toolbox for a client-app account, the same on every page: its own Aming account, and each business it
 * has (its studio, agency, vendor account), so Alexis never says "not from here". Only businesses it already
 * has: studioOfCaller would open a studio for an account without one.
 */
export async function clientAppToolbox(person: Person): Promise<Toolbox> {
  if (person.type !== "client") return { read: [], change: [], abilities: "Nothing in this app." };
  const chat = fromChat(person);
  const widgets: Widgets = { logo: false, serviceMedia: null };
  const { owned, working } = await studiosOf(person.id);
  const businesses = (
    await Promise.all([owned || working.length ? studioTools(widgets) : null, agentTools(person), vendorTools(person)])
  ).filter((b): b is NonNullable<typeof b> => !!b);
  return {
    read: [...chat.tools, explainPriceTool(), handToStaff(person), ...businesses.flatMap((b) => b.read)],
    change: [...clientOrderTools(person), ...walletTools(person), cancellationTool(person), addFilesToOrderTool(person.id), ...businesses.flatMap((b) => b.change)],
    replyExtras: () => ({
      ...chat.extras(),
      widgets: [...(widgets.logo ? (["logo"] as const) : []), ...(widgets.serviceMedia ? ([`service-media:${widgets.serviceMedia}`] as const) : [])],
    }),
    abilities: [
      "Everything the chat assistant does for them: take and place Aming orders, invoice them, send MTN or Airtel payment prompts, pay all their invoices at once, top up their wallet, add photos to an order, look up their orders, invoices, receipts, wallet and prices, show product photos, and call the team.",
      ...businesses.map((b) => b.words),
      "All of this works from any page: never tell them to go to another page to do something you have a tool for.",
      "Show them the way around the app only when they ask where something is.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
