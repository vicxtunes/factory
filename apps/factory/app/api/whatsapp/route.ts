import { createHmac, timingSafeEqual } from "node:crypto";

import { after } from "next/server";

import { agreeToTerms, bossById, currentTerms, hasAgreed, send } from "@repo/lib/assistant/panel/server";

import { staffAppToolbox } from "../../alexis-tools";

// Alexis on the bosses' WhatsApp (Meta's WhatsApp Cloud API). Meta calls this
// address with every message to the business number; only messages from a
// listed boss's own number are answered, as that boss, with the same tools as the app
// but read-only: changes are made in the app, where Confirm checks the sign-in.
//
// Environment (the staff app's):
//   WHATSAPP_VERIFY_TOKEN     any long random text, typed into Meta's webhook settings too
//   WHATSAPP_APP_SECRET       the Meta app's secret: proves a call came from Meta
//   WHATSAPP_TOKEN            a permanent system-user access token
//   WHATSAPP_PHONE_NUMBER_ID  the business number's id in Meta
//   WHATSAPP_BOSSES           each boss's WhatsApp number and dashboard account id (profiles.id),
//                             e.g. 256772123456:<id>,256701234567:<id>
//   WHATSAPP_GRAPH_VERSION    optional, default v21.0
// Webhook URL in Meta: https://<staff app domain>/api/whatsapp, subscribed to "messages".

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v21.0"}`;
const lastNine = (s: string) => s.replace(/\D/g, "").slice(-9);

/** The boss account linked to a WhatsApp number, if that number is listed. */
function bossIdFor(from: string): string | undefined {
  for (const pair of (process.env.WHATSAPP_BOSSES ?? "").split(",")) {
    const [number, id] = pair.split(":").map((s) => s.trim());
    if (number && id && lastNine(number) === lastNine(from)) return id;
  }
}

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
  /** A tap on one of our reply buttons. */
  interactive?: { type: string; button_reply?: { id: string; title: string } };
}

/** Meta sends a message again when it isn't sure we got it: each is answered once. */
const answered = new Set<string>();

async function reply(to: string, body: string): Promise<void> {
  await post({ messaging_product: "whatsapp", to, type: "text", text: { body: body.slice(0, 4000) } });
}

/** A message with reply buttons (WhatsApp allows up to three, titles up to 20 characters). */
async function ask(to: string, body: string, buttons: { id: string; title: string }[]): Promise<void> {
  await post({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: { type: "button", body: { text: body.slice(0, 1000) }, action: { buttons: buttons.map((b) => ({ type: "reply", reply: b })) } },
  });
}

async function post(message: unknown): Promise<void> {
  const res = await fetch(`${GRAPH()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok) console.error("whatsapp reply failed:", res.status, await res.text().catch(() => ""));
}

async function answer(message: Incoming): Promise<void> {
  const bossId = bossIdFor(message.from);
  const person = bossId ? await bossById(bossId) : null;
  if (!person) return;
  // Alexis's terms, agreed in the chat itself (owner, 2026-11-15): the terms,
  // then Agree / Disagree buttons. Agree accepts that version.
  const terms = await currentTerms();
  if (terms && !(await hasAgreed(person, terms.version))) {
    const tapped = message.interactive?.button_reply?.id;
    if (tapped === `terms_agree_${terms.version}`) {
      await agreeToTerms(person, terms.version);
      await reply(message.from, "Thank you, you've agreed to Alexis's terms. Ask me anything.");
    } else if (tapped?.startsWith("terms_disagree")) {
      await reply(message.from, "No problem. Alexis can't help until you agree. Send any message to see the terms again.");
    } else {
      await reply(message.from, `Alexis's terms\n\n${terms.body.length > 3800 ? `${terms.body.slice(0, 3800)}…\n\n(The full terms are in the app, in Alexis.)` : terms.body}`);
      await ask(message.from, "Do you agree to Alexis's terms above?", [
        { id: `terms_agree_${terms.version}`, title: "Agree" },
        { id: `terms_disagree_${terms.version}`, title: "Disagree" },
      ]);
    }
    return;
  }
  if (message.type !== "text" || !message.text?.body) {
    await reply(message.from, "I can only read text messages. Please type your question.");
    return;
  }
  const res = await send(person, null, message.text.body, { path: "", title: "", links: [] }, await staffAppToolbox(person, "", "whatsapp"), "whatsapp");
  await reply(message.from, res.ok ? res.reply.body : res.error);
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!signedByMeta(body, request.headers.get("x-hub-signature-256"))) return new Response("Forbidden", { status: 403 });

  let messages: Incoming[] = [];
  try {
    const payload = JSON.parse(body) as { entry?: { changes?: { value?: { messages?: Incoming[] } }[] }[] };
    messages = (payload.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Only the listed bosses' numbers; anyone else writing to the business number is left alone.
  const mine = messages.filter((m) => !!bossIdFor(m.from) && !answered.has(m.id));
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
