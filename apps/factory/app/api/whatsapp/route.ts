import { createHmac, timingSafeEqual } from "node:crypto";

import { after } from "next/server";

import { bossById, send } from "@repo/lib/assistant/panel/server";

import { staffAppToolbox } from "../../alexis-tools";

// Alexis on the boss's WhatsApp (Meta's WhatsApp Cloud API). Meta calls this
// address with every message to the business number; only messages from the
// boss's own number are answered, as the boss, with the same tools as the app
// but read-only: changes are made in the app, where Confirm checks the sign-in.
//
// Environment (the staff app's):
//   WHATSAPP_VERIFY_TOKEN     any long random text, typed into Meta's webhook settings too
//   WHATSAPP_APP_SECRET       the Meta app's secret: proves a call came from Meta
//   WHATSAPP_TOKEN            a permanent system-user access token
//   WHATSAPP_PHONE_NUMBER_ID  the business number's id in Meta
//   WHATSAPP_BOSS_NUMBER      the boss's own WhatsApp number (e.g. 256772123456)
//   WHATSAPP_BOSS_USER_ID     the boss's dashboard account id (profiles.id)
//   WHATSAPP_GRAPH_VERSION    optional, default v21.0
// Webhook URL in Meta: https://<staff app domain>/api/whatsapp, subscribed to "messages".

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v21.0"}`;
const lastNine = (s: string) => s.replace(/\D/g, "").slice(-9);

/** Meta's check that this address is ours, when the webhook is set up. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function signedByMeta(body: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

interface Incoming {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
}

/** Meta sends a message again when it isn't sure we got it: each is answered once. */
const answered = new Set<string>();

async function reply(to: string, body: string): Promise<void> {
  const res = await fetch(`${GRAPH()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: body.slice(0, 4000) } }),
  });
  if (!res.ok) console.error("whatsapp reply failed:", res.status, await res.text().catch(() => ""));
}

async function answer(message: Incoming): Promise<void> {
  const bossId = process.env.WHATSAPP_BOSS_USER_ID;
  const person = bossId ? await bossById(bossId) : null;
  if (!person) return;
  if (message.type !== "text" || !message.text?.body) {
    await reply(message.from, "I can only read text messages. Please type your question.");
    return;
  }
  const res = await send(person, message.text.body, { path: "", title: "", links: [] }, await staffAppToolbox(person, "", "whatsapp"), "whatsapp");
  await reply(message.from, res.ok ? res.reply.body : res.error);
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!signedByMeta(body, request.headers.get("x-hub-signature-256"))) return new Response("Forbidden", { status: 403 });

  const boss = process.env.WHATSAPP_BOSS_NUMBER;
  let messages: Incoming[] = [];
  try {
    const payload = JSON.parse(body) as { entry?: { changes?: { value?: { messages?: Incoming[] } }[] }[] };
    messages = (payload.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Only the boss's own number; anyone else writing to the business number is left alone.
  const mine = messages.filter((m) => !!boss && lastNine(m.from) === lastNine(boss) && !answered.has(m.id));
  for (const m of mine) {
    answered.add(m.id);
    if (answered.size > 500) answered.delete(answered.values().next().value!);
  }
  // Meta wants an answer within seconds: the reply goes out afterwards.
  after(async () => {
    for (const m of mine) await answer(m).catch((err) => console.error("whatsapp alexis:", err));
  });
  return new Response("OK", { status: 200 });
}
