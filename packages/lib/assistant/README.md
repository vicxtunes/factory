# Alexis (the assistant)

Answers clients in their support and order chats, as "Alexis" (until v4 "Aming assistant": `ASSISTANT_NAMES` keeps both its own): takes an order from their own words, asks
for photos, approves it, invoices it, asks for payment, sends receipts, and answers about their orders, account,
products and the app. Runs on OpenAI or Claude (`server/providers.ts`, official SDKs, low effort). The developer account
(`SUPPORT_OWNER_EMAIL`) picks which on Dashboard → Assistant; the list and prices are `ASSISTANT_MODELS` in `core/rules.ts`.

- **Waking up:** a trigger on `chat_messages` marks a chat waiting when a client writes, and quiet when staff or its
  designer write. The client app checks every 2 s (`answerWaitingChats`), 3 s after the client's last message, and shows "Alexis is typing" while it works. It can put tappable answers and product photos under a reply (`chat_messages.choices`, `images`). Asking for staff doesn't silence it; a person writing does. Staff
  tap **Hand back** in the chat to return it.
- **Switch:** Dashboard → Assistant (boss): off, test (only listed clients) or live; daily spending limit; what it did.
  It needs `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` in the client app's environment. At the limit or on any failure, it hands to staff.
- **Enforced in code (`core/rules.ts`, `server/tools.ts`), whatever the model says:** the client comes from the chat,
  never from a tool's input; orders need photos or a link on every item; an order is placed only from a summary the
  client answered in a later message, once; it approves and invoices only when every line has a price (anything else
  waits for reception); 3 payment prompts a day; at most 1,000 of one item; one staff alert per chat per hour. It has no tool to mark money paid, spend the wallet, refund, cancel,
  discount or route to production, and it never asks HivePay for status.
- **Sent to the chosen AI company:** chat text, names, phone on file, order and money figures for that client. Not the photos: it
  sees only file names and ids. Promo codes go to staff.

**Orders from the order form** (`server/review.ts`, every minute, 2 minutes after placing so uploads can finish, for 24 hours): every item
priced and with photos or a link means approved, invoiced and the client asked to pay in the order's chat. Otherwise it tells the client once
what's missing: it asks for photos (added from chat, then reviewed again), or says reception will confirm the price. Same off/test/live switch.

## Alexis on every page (`panel/`)

A floating Alexis button in every signed-in app (`packages/ui/assistant/Alexis.tsx`, mounted once in each app's root layout):
staff, designers, workers, and client-app accounts (clients, studios, vendors, agents). Studios' own clients sign in on the
studio's page without an Aming account, so they never see it. Plan: the "Alexis everywhere" doc (memory `alexis-everywhere-plan`).

- **Switch:** Dashboard → Assistant → Alexis on every page: off, test (the boss, the developer and the test list) or live.
  Separate from the chat assistant's switch; same model, same company daily limit.
- **Terms:** nobody uses it before agreeing to the newest version (`assistant_terms`, `assistant_terms_acceptances`). The boss
  publishes a version; a new one asks everyone again.
- **Paid, free for now:** each reply's charge = real AI cost × `charge_multiplier` (2), recorded on `assistant_runs` against the
  payer and marked waived while `charging_from` is empty. Payer (`core.ts` `payerForPage`): staff, designers, workers → the
  company; a client-app account → the studio, vendor or agent account whose pages it's on, else itself. A studio's team shares one bill.
- **Monthly cap:** `monthly_cap_usd` (US$1) of charge per paying account; then it pauses until the 1st (Kampala). The company has none.
- **Usage:** the panel's Usage tab, in the person's top-bar currency through the US dollar's rate (US$ when it has none; staff see UGX).
- **Tools (`toolbox.ts`):** each app builds them for whoever is signed in (`apps/factory/app/alexis-tools.ts`,
  `panel/tools/client-app.ts`), from the functions its own pages and buttons use, given only to the roles those already
  allow. Reads run straight away. A **change** only prepares a card (`assistant_pending_actions`): it runs once, through
  the app's own server action (which checks the role again), when the person taps Confirm within 15 minutes. That table
  is also the record of every change (Dashboard → Assistant → Changes made through Alexis). No payments, refunds,
  withdrawals, payouts or deletions.
  - Staff: orders, clients, the review queue (managers); money and expenses, record an expense or a repeating one
    (boss, supervisors); server health, agents, staff accounts, currencies; set a currency rate, a staff role, a
    commission rate, register an agent (boss). Item status and new clients (managers). Designers and workers: their board.
  - Client app: everything the chat assistant does, on cards instead of a "yes" in chat (`tools/client-orders.ts`):
    place an order (checked and priced by the chat's `checkOrderItems`; approved and invoiced at once with a photo link, or
    left to the order form's review once attached photos have uploaded), create an invoice, send an MTN/Airtel prompt; plus
    the chat's own reads, tappable answers and product photos, and hand_to_staff (the team is told, once an hour). Also: on `/studio` its money, clients (add one) and
    vendor jobs by team area; on `/agents` figures and clients (add one); on `/vendors` jobs.
- **Screens (`packages/ui/assistant`):** `AlexisPanel` (the floating button's quick chat: the newest chat, New chat, All chats),
  `AlexisPage` (the full page: `/alexis` in the client app, `/dashboard/alexis` for staff; chats on the left with search and
  the orange "free for now" card, the welcome with a big message box and suggestions for the role), sharing `AlexisChat`.
- **Chats:** `assistant_chats`, each named after its first message; WhatsApp is one chat named WhatsApp.
- **Attach:** clients and managers attach files in the message box. Alexis sees only their names. `add_files_to_order`
  (`tools/order-files.ts`) prepares a card for one order item; once confirmed, the files upload from the device through
  `uploadFileToStorage`, the order's own upload path, which checks again who may add to that item.
- **Show the way:** the panel sends the links on the page; `show_the_way` picks pages from them, and the guide bar opens
  each and outlines the button to tap.
- **Server health (`tools/health.ts`):** Uptime Kuma (`/metrics` with an API key), Beszel (a read-only user) and the money
  watch's open alerts, for the boss. Kuma and Beszel need their settings in the staff app's environment (`.env.example`).
- **WhatsApp (`apps/factory/app/api/whatsapp/route.ts`):** the boss's own number only, as the boss, read-only (changes need
  the app's sign-in for Confirm). Needs the WHATSAPP_* settings and a Meta business number with the webhook pointed at it.

## Streaming, tracing, evaluations, security (2026-11-08)

- **Streaming:** each app's `POST /api/alexis` (`panel/stream.ts`) answers as lines of JSON: what Alexis is doing ("Looking up
  your orders") and its words as they come. Only from the app's own pages (Origin must be this site, JSON only).
- **Tracing:** every reply's tool calls (input, output, time, refused or not) are kept in `assistant_runs.trace` and shown
  under Latest Alexis replies on Dashboard → Assistant.
- **Evaluations:** `npm run eval:alexis` runs ten real conversations with the real AI, Alexis's real instructions and tool
  definitions, and fixture data (`panel/evals/run.ts`): ordering, a vague order, an order's status, prompt injection in order
  notes, payment, showing the way, off-topic, studio setup, adding a service, the boss's money. Run it after changing the
  instructions or tools. A few US cents a run; never touches the database.
- **Security:** the guide only sends people to this app's own pages (`isAppPath`), at most 30 messages per person per
  10 minutes, page link labels and tool results are data, never instructions. Both apps send frame-ancestors 'self',
  X-Frame-Options, nosniff, a referrer policy and HSTS, and no x-powered-by.
