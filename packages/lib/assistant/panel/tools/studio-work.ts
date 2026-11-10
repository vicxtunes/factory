import "server-only";

import { z } from "zod";

import { createInvoice, createQuotation } from "@repo/lib/billing/actions";
import { customers } from "@repo/lib/customers/server";
import { formatMoney } from "@repo/lib/currency/format";
import { offerings } from "@repo/lib/offerings/server";
import { createAdminClient } from "@repo/lib/supabase/admin";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { AssistantTool } from "../../server/tools";
import { changeTool, readTool, type ChangeTool } from "../toolbox";

// A studio's everyday work with Alexis: quotations and invoices for its own
// clients (through the billing module's own actions), photos on its packages
// (the app's own photos panel, shown in the chat), and what other studios on
// Aming charge for a service, as a range that names no one.

/** One of the studio's clients by name: the only exact match, else the only one containing it. Throws a sentence. */
async function clientNamed(scope: TenantScope, name: string): Promise<{ id: string; name: string }> {
  const all = await customers.list(scope);
  const q = name.trim().toLowerCase();
  const exact = all.filter((c) => c.name.toLowerCase() === q);
  const found = exact.length ? exact : all.filter((c) => c.name.toLowerCase().includes(q));
  if (found.length === 1) return { id: found[0]!.id, name: found[0]!.name };
  if (!found.length) throw new Error(`There's no client called ${name}. Add them first (add_studio_client), or check the name.`);
  throw new Error(`Several clients match ${name}: ${found.slice(0, 6).map((c) => c.name).join(", ")}. Ask which one.`);
}

const docInput = z.object({
  kind: z.enum(["quotation", "invoice"]),
  client: z.string().min(1).max(120).describe("The studio client's name, as on their client list."),
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(200).describe("e.g. Wedding photography: Gold package"),
        quantity: z.number().int().min(1).max(10_000),
        unitPrice: z.number().int().min(0).describe("In the studio's currency, whole amounts."),
      }),
    )
    .min(1)
    .max(30),
  date: z.string().nullable().describe("YYYY-MM-DD: the invoice's due date, or how long the quotation is valid. Null for none."),
  notes: z.string().max(2000).nullable(),
});

export function studioDocumentTool(scope: TenantScope): ChangeTool {
  return changeTool({
    name: "create_studio_document",
    description:
      "Create a quotation or an invoice for one of the studio's own clients: the client, the items with quantities and prices, a due date (invoice) or valid-until date (quotation), and notes. Ask for anything missing first; never guess a price.",
    inputSchema: docInput,
    card: async (d) => {
      const client = await clientNamed(scope, d.client);
      const total = d.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
      return {
        title: `${d.kind === "invoice" ? "Invoice" : "Quotation"} for ${client.name}: ${formatMoney(total, scope.currency)}`,
        lines: [
          ...d.lines.map((l) => `${l.quantity} × ${l.description}: ${formatMoney(l.quantity * l.unitPrice, scope.currency)}`),
          ...(d.date ? [`${d.kind === "invoice" ? "Due" : "Valid until"} ${d.date}`] : []),
        ],
      };
    },
    run: async (d) => {
      const client = await clientNamed(scope, d.client);
      const lines = d.lines.map((l) => ({ offeringId: null, description: l.description, inclusions: [], quantity: l.quantity, unitPrice: l.unitPrice, discount: null }));
      const notes = d.notes ?? "";
      const res =
        d.kind === "invoice"
          ? await createInvoice({ customerId: client.id, dueDate: d.date, shoot: null, notes, lines })
          : await createQuotation({ customerId: client.id, validUntil: d.date, shoot: null, notes, lines });
      if (!res.ok) return { ok: false, error: res.error };
      const where = d.kind === "invoice" ? `/studio/invoices/${res.data}` : `/studio/quotations/${res.data}`;
      return { ok: true, done: `The ${d.kind} for ${client.name} is ready: open it at ${where} to share its link or send it.` };
    },
  });
}

/** The package photos panel for one service, shown under Alexis's reply. */
export function packagePhotosTool(scope: TenantScope, widgets: { serviceMedia: string | null }): AssistantTool {
  return readTool({
    name: "show_package_photos",
    description:
      "Show the photos panel for one of the studio's services (cover photo, gallery, preview video) under your reply, so the owner adds or changes its photos right there. Use it when they want to add photos to a package or service.",
    inputSchema: z.object({ service: z.string().min(1).max(80).describe("The service's name, e.g. Wedding Photography.") }),
    run: async ({ service }) => {
      const all = (await offerings.manage(scope, "service")).flatMap((c) => c.services);
      const q = service.trim().toLowerCase();
      const found = all.filter((s) => s.name.toLowerCase() === q).length ? all.filter((s) => s.name.toLowerCase() === q) : all.filter((s) => s.name.toLowerCase().includes(q));
      if (found.length !== 1) {
        return found.length
          ? `Refused: several services match: ${found.map((s) => s.name).join(", ")}. Ask which one.`
          : `Refused: there's no service called ${service}. Their services: ${all.map((s) => s.name).join(", ") || "none yet"}.`;
      }
      widgets.serviceMedia = found[0]!.id;
      return `The photos panel for ${found[0]!.name} is under your reply: tell them to add their photos there (the first is the cover).`;
    },
  });
}

/** At least this many other studios before a range is given, so no one studio's prices can be told apart. */
const MIN_STUDIOS = 3;

/** What other open studios on Aming charge for a kind of service: a range, never a name. */
export function marketPricesTool(scope: TenantScope): AssistantTool {
  return readTool({
    name: "market_prices",
    description:
      "What other studios on Aming charge for a kind of service (e.g. wedding photography, birthday shoot), from their public packages: how many studios, the usual starting price, and the range. Names no studio. Use it when they ask what others charge or how to price.",
    inputSchema: z.object({ service: z.string().min(3).max(60) }),
    run: async ({ service }) => {
      const words = service
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !["photography", "photo", "photos", "shoot", "session", "package", "packages"].includes(w));
      const terms = words.length ? words : service.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
      if (!terms.length) return "Refused: say which service, e.g. wedding or birthday.";
      const db = createAdminClient();
      const { data, error } = await db
        .from("offering_services")
        .select("id, tenant_id, name, tenant:tenants!inner (status, currency), packages:offerings (price, archived_at)")
        .eq("kind", "service")
        .is("archived_at", null)
        .neq("tenant_id", scope.tenantId)
        .eq("tenant.status", "active")
        .eq("tenant.currency", scope.currency)
        .or(terms.map((t) => `name.ilike.%${t.replace(/[,()%]/g, "")}%`).join(","))
        .limit(400);
      if (error) throw new Error(error.message);
      // Each studio's own starting and top prices for that service.
      const byStudio = new Map<string, number[]>();
      for (const s of (data ?? []) as unknown as { tenant_id: string; packages: { price: number; archived_at: string | null }[] }[]) {
        const prices = s.packages.filter((p) => !p.archived_at && Number(p.price) > 0).map((p) => Number(p.price));
        if (prices.length) byStudio.set(s.tenant_id, [...(byStudio.get(s.tenant_id) ?? []), ...prices]);
      }
      if (byStudio.size < MIN_STUDIOS) return { studios: byStudio.size, note: `Too few studios on Aming list a "${service}" service to give a fair range. Suggest pricing from their costs and time.` };
      const starts = [...byStudio.values()].map((p) => Math.min(...p)).sort((a, b) => a - b);
      const tops = [...byStudio.values()].map((p) => Math.max(...p)).sort((a, b) => a - b);
      const median = (xs: number[]) => xs[Math.floor(xs.length / 2)]!;
      return {
        studios: byStudio.size,
        usualStartingPrice: formatMoney(median(starts), scope.currency),
        startingPrices: `${formatMoney(starts[0]!, scope.currency)} to ${formatMoney(starts.at(-1)!, scope.currency)}`,
        usualTopPackage: formatMoney(median(tops), scope.currency),
        note: "From other studios' public packages on Aming. Never name or point to any studio.",
      };
    },
  });
}
