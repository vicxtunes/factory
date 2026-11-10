import "server-only";

import type { BuildToolbox } from "./app";
import { isAppPath } from "./core";
import * as panel from "./server";
import { pageLinksSchema } from "./toolbox";

// Each app's POST /api/alexis: one message to Alexis, answered as a stream of
// lines of JSON, so the person sees what it's doing and its words as they come:
//   { "type": "step", "words": "Looking up your orders" }
//   { "type": "text", "step": 0, "delta": "Your order" }
//   { "type": "done", "result": SendResult }
// Only from the app's own pages: the browser must say it's this site (Origin)
// and send JSON, which a form on another site can't, so another site can't
// make someone's Alexis act for them.

/** What the person sees while a tool runs. */
const STEP_WORDS: Record<string, string> = {
  get_my_orders: "Looking up your orders",
  get_my_account: "Checking your account",
  get_my_receipts: "Finding your receipts",
  get_catalog: "Looking at the catalog",
  get_prices: "Checking prices",
  get_typical_times: "Checking how long it takes",
  get_pay_options: "Getting your payment options",
  show_product_photos: "Finding photos",
  place_order: "Preparing your order",
  create_invoice: "Preparing the invoice",
  request_payment: "Preparing the payment prompt",
  add_files_to_order: "Preparing your photos",
  find_orders: "Looking up orders",
  find_clients: "Looking up clients",
  money_overview: "Checking the money",
  payments: "Going through the payments",
  sales: "Going through the sales",
  expenses: "Going through the expenses",
  database_tables: "Looking through the records",
  ask_database: "Looking through the records",
  server_health: "Checking the servers",
  studio_page_status: "Checking your page",
  service_samples: "Looking at examples",
  show_the_way: "Working out the way",
  hand_to_staff: "Telling the team",
};

const fromThisSite = (request: Request) => {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

export async function streamAsk(build: BuildToolbox, request: Request): Promise<Response> {
  if (!fromThisSite(request) || !request.headers.get("content-type")?.startsWith("application/json")) {
    return new Response("Forbidden", { status: 403 });
  }
  const person = await panel.currentPerson();
  if (!person) return Response.json({ ok: false, error: "Sign in to use Alexis." }, { status: 401 });

  let body: { chatId?: unknown; text?: unknown; page?: { path?: unknown; title?: unknown; links?: unknown }; files?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const path = String(body.page?.path ?? "/").slice(0, 300);
  const page = {
    path: isAppPath(path) ? path : "/",
    title: String(body.page?.title ?? "").slice(0, 120),
    links: pageLinksSchema.parse(body.page?.links).filter((l) => isAppPath(l.href)),
  };
  const files = Array.isArray(body.files) ? body.files.map((f) => String(f)) : [];
  const chatId = typeof body.chatId === "string" && body.chatId ? body.chatId : null;
  const toolbox = await build(person, page.path);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      try {
        const result = await panel.send(person, chatId, String(body.text ?? ""), page, toolbox, "app", files, {
          onStep: (tool) => write({ type: "step", words: STEP_WORDS[tool] ?? "Working on it" }),
          onText: (step, delta) => write({ type: "text", step, delta }),
        });
        write({ type: "done", result });
      } catch (err) {
        console.error("alexis stream:", err);
        write({ type: "done", result: { ok: false, error: "Sorry, Alexis couldn't answer just now. Try again in a moment." } });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
