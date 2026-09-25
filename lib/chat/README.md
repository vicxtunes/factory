# Chat module

In-app messaging between everyone who signs in to the app: staff (receptionist / supervisor /
boss), factory workers, graphics designers, and clients.

- **Direct messages**: private, one-to-one.
- **Groups**: named, several internal members (staff, workers, designers).
- **Order threads**: one per order, shared by the order's client, its designer, anyone pulled in,
  and all staff.
- **Support**: one thread per client with "the team" (all staff).

Features: realtime delivery, unread badges, read receipts ("Seen"), typing indicators, push
notifications, voice messages, photo/video/file attachments, replies, edit/delete, mute, member
management, message search, and order status updates posted into order threads.

## Layout

```
lib/chat/
  types.ts            Shared view models. Pure; safe on client and server.
  policy.ts           Every permission rule and limit. Pure; safe on client and server.
  routes.ts           Chat URLs (/chat?c=<id>). Pure.
  actions.ts          "use server" — the ONLY entry point the browser calls.
  server/
    service.ts        Use cases: load, check policy, write, schedule side effects.
    repository.ts     All queries against the chat_* tables. No rules.
    presenter.ts      Rows → view models (viewer-relative titles, signed URLs).
    identity.ts       Adapter: app auth → chat participant.          (touches lib/audit)
    directory.ts      Adapter: people + order tables → names, rules.  (touches app tables)
    storage.ts        Adapter: Supabase Storage for attachments.
    signals.ts        Adapter: Supabase Realtime "doorbells".
    notifier.ts       Adapter: web push.                              (touches lib/push)
  client/
    useChatSignals.ts     Realtime subscription hook (shared, reference-counted).
    useTypingIndicator.ts Typing indicators for the open conversation.
    upload.ts             Direct-to-storage upload with progress.

components/chat/      React UI. Talks only to lib/chat/actions, types, policy, routes.
app/chat/page.tsx     The /chat route, rendered inside the viewer's own surface chrome.
supabase/migrations/20260925100000_chat.sql
```

### Dependency rules

```
components/chat ──▶ lib/chat/actions ──▶ server/service ──▶ server/repository
        │                   │                   │  └──▶ server/{directory,storage,signals,notifier,identity}
        └──▶ lib/chat/{types,policy,routes} ◀───┘
```

- The rest of the app uses chat **only** through `actions.ts`, `types.ts`, `routes.ts` and the
  components in `components/chat/`. Nothing outside `lib/chat` imports from `lib/chat/server`.
- Inside chat, the **adapters** are the only files that import app code (`lib/audit`,
  `lib/push`, `lib/supabase`, `lib/storage`, app tables). To change how people, auth, push or
  files work, change one adapter. The service, policy and UI stay the same.
- `service.ts` never reads cookies. It receives the viewer explicitly, so you can call it
  from a route handler, a cron job or a test.

## Who can do what

All rules live in [`policy.ts`](./policy.ts).

| From \ To  | Staff           | Worker | Designer | Client                        |
| ---------- | --------------- | ------ | -------- | ----------------------------- |
| Staff      | DM              | DM     | DM       | DM (private)                  |
| Worker     | DM              | DM     | DM       | —                             |
| Designer   | DM              | DM     | DM       | DM (only on a shared order)   |
| Client     | → support team  | —      | DM (only their order's designer) | —     |

- **A DM is always private to its two people.** No one else can read it, including staff and
  the boss. The only conversations staff share are order and support threads, and the chat
  header says "Shared with all staff" on those.
- Clients don't choose an individual staff member. "Support team" opens their shared support
  thread. They can still reply in a private chat that a staff member started with them.
- **Groups** are internal only. Clients can't create or join them. Any member can add people,
  only the owner can remove them, and ownership passes on if the owner leaves.
- **Order threads**: anyone involved in the order can open them (the client, the assigned
  designer, workers with an item assigned, and staff). Staff can add workers and designers.
- **Support and order threads** are visible to all staff without joining. A staff member who
  reads or replies "follows" the thread and gets its notifications. If a client writes into a
  thread that no staff member follows yet, every staff member is notified.
- Only the author can edit or delete a message. Deleted messages keep their place in the thread
  but lose their content.
- Anyone who isn't allowed to see a conversation gets "not found", never "forbidden", so the
  API can't be used to probe which conversations exist.

To change a rule, edit the table or function in `policy.ts`. The server enforces it, and the UI
follows the `permissions` object the server returns.

## Security model

Workers, designers and clients don't use Supabase Auth. They sign in with signed cookies, so
the browser reaches Supabase as `anon`, and Row Level Security can't tell them apart. Therefore:

1. **Every chat table has RLS on and no policies.** Only the service-role client inside a server
   action can read or write. `chat_inbox()` is revoked from `anon` and `authenticated`.
2. **Realtime carries no content.** Each person gets a private Broadcast channel whose name is an
   HMAC of their identity with `APP_SECRET`, so it can't be guessed. All staff also share one
   team channel. After a write, the server sends `{ type, conversationId }` to the relevant
   channels. The browser reacts by re-fetching through access-checked server actions.
3. **Attachments live in a private bucket** (`chat-attachments`) and are only readable through
   one-hour signed URLs, minted after an access check. Uploads go straight from the browser to
   Storage with a signed token scoped to the conversation's folder. The server then checks that
   the object exists, sits in that folder, and has an allowed type before recording it.
4. **Typing indicators go browser to browser** on a per-conversation channel. Its HMAC-derived
   name is only handed out with the conversation details, after the access check. Nothing is
   stored.

## Data model

| Table                | Purpose                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `chat_conversations` | One row per conversation. Keeps a cached last-message preview for the inbox. |
| `chat_participants`  | Membership, role, `last_read_at` (unread counts + receipts), mute, soft leave. |
| `chat_messages`      | Text / attachment / system messages, replies, edit and soft-delete markers.  |
| `chat_attachments`   | Files per message, including `duration_ms` for audio/video.                |

Database functions, all callable only with the service-role key:

- `chat_inbox()`: a person's conversations with their unread counts.
- `chat_search()`: messages matching a search that the person is allowed to see. A trigram index
  keeps substring search fast.
- Triggers keep the inbox preview current, including "🎤 Voice message" and "📷 Photo" for
  attachments without text. They also copy order status updates into order threads (see below).

Uniqueness is enforced in the database: one DM per pair (`direct_key`), one thread per order,
and one support thread per client. This makes "open conversation" idempotent even when two
people open it at the same moment.

## Using chat from other pages

```tsx
import { ChatLauncher } from "@/components/chat/ChatLauncher";      // header icon + unread badge
import { OrderChat } from "@/components/chat/OrderChat";         // order thread, inline in any order view
import { chatHref } from "@/lib/chat/routes";                        // link to /chat or a conversation

<ChatLauncher />
<OrderChat orderId={order.id} />
<Link href={chatHref(conversationId)}>Open chat</Link>
```

From server code (for example, to message a client when their order ships), call the service
directly with an explicit viewer:

```ts
import * as chat from "@/lib/chat/server/service";

const id = await chat.openSupport(staffViewer, clientId);
await chat.sendMessage(staffViewer, { conversationId: id, body: "Your order has shipped!" });
```

## Extending

### Adding a new kind of user

1. Add the type to `ParticipantType` in `types.ts` and to the `participant_type` check
   constraint (new migration).
2. Add a row and column to `DIRECT_MESSAGE_MATRIX` in `policy.ts`.
3. Teach `server/directory.ts` where that person's name and avatar live.
4. Make `server/identity.ts` recognise their session.

### How the remaining features work

- **Voice messages**: `components/chat/VoiceRecorder.tsx`. Tap the mic (it appears when the draft
  is empty), then send or discard. It records WebM/Opus where the browser supports it and
  MP4/AAC on Safari. Recordings stop automatically after `CHAT_LIMITS.maxVoiceMessageMs`
  (5 minutes). Recordings are uploaded like any other attachment with `durationMs` set.
  Recording needs HTTPS (or localhost) and microphone permission.
- **Typing indicators**: `lib/chat/client/useTypingIndicator.ts`. Each browser announces
  "typing" at most every 2.5 seconds while keys are pressed, and "stopped" when a message is
  sent or the draft is cleared. A typist who goes quiet expires after 6 seconds.
- **Message search**: type two or more characters in the inbox search box. Chat names are
  filtered locally, and message text is searched on the server (`searchMessages`). Picking a
  result opens its conversation. `%` and `_` are searched literally.
- **Order status updates**: every order lifecycle event (completed, delayed, assigned, ready,
  cancelled) is already written to `notifications`. A trigger copies each one into that order's
  thread as a system message, but only if the thread exists. No order code knows about chat.
  These messages don't push or count as unread, because people already get the notification
  itself. Open threads pick them up on their next refresh (focus or the 60-second fallback).

### Ideas for later

- Jump to the matching message when opening a search result. Search currently opens the
  conversation at its newest messages.
- Reactions (👍) on messages.
- Delivery via SMS or email for clients without push, by swapping `server/notifier.ts`.

## Deploying

1. Apply the migrations: `npx supabase db push`. Alternatively, paste
   `supabase/migrations/20260925100000_chat.sql` and then `20260925120000_chat_extras.sql` into
   the SQL editor, in that order.
2. Make sure Realtime → Settings allows public channels. The chat channels are public but
   unguessable; see the security model above.
3. No new environment variables. Chat uses the existing `APP_SECRET`, Supabase keys and VAPID
   keys.
