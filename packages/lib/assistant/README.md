# Aming assistant

Answers clients in their support and order chats, as "Aming assistant": takes an order from their own words, asks
for photos, approves it, invoices it, asks for payment, sends receipts, and answers about their orders, account,
products and the app. Uses Claude (`claude-opus-5-5`, effort low) through `@anthropic-ai/sdk`.

- **Waking up:** a trigger on `chat_messages` marks a chat waiting when a client writes, and quiet when staff or its
  designer write. The client app checks every 5 s (`answerWaitingChats`), 4 s after the client's last message. Staff
  tap **Hand back** in the chat to return it.
- **Switch:** Dashboard → Assistant (boss): off, test (only listed clients) or live; daily spending limit; what it did.
  It needs `ANTHROPIC_API_KEY` in the client app's environment. At the limit or on any failure, it hands to staff.
- **Enforced in code (`core/rules.ts`, `server/tools.ts`), whatever the model says:** the client comes from the chat,
  never from a tool's input; orders need photos or a link on every item; an order is placed only from a summary the
  client answered in a later message, once; it approves and invoices only when every line has a price (anything else
  waits for reception); 3 payment prompts a day. It has no tool to mark money paid, spend the wallet, refund, cancel,
  discount or route to production, and it never asks HivePay for status.
- **Sent to Anthropic:** chat text, names, phone on file, order and money figures for that client. Not the photos: it
  sees only file names and ids. Promo codes go to staff.
