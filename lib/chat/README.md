# Chat module

In-app messaging between everyone who signs in to the app: staff (receptionist / supervisor /
boss), factory workers, graphics designers, and clients.

- **Direct messages**: private, one-to-one.
- **Groups**: named, several internal members (staff, workers, designers).
- **Order threads**: one per order, shared by the order's client, its designer, anyone pulled in,
  and all staff.
- **Support**: one thread per client with "the team" (all staff).

Features: realtime delivery, unread badges, read receipts ("Seen"), push notifications,
photo/video/audio/file attachments, replies, edit/delete, mute, member management. Voice
messages are supported in the data model and UI but have no recorder yet (see
[Adding voice recording](#adding-voice-recording)).

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
    useChatSignals.ts Realtime subscription hook (shared, reference-counted).
    upload.ts         Direct-to-storage upload with progress.

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
| Staff      | DM              | DM     | DM       | → client's support thread     |
| Worker     | DM              | DM     | DM       | —                             |
| Designer   | DM              | DM     | DM       | DM (only on a shared order)   |
| Client     | → support       | —      | DM (only their order's designer) | —     |

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

## Data model

| Table                | Purpose                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `chat_conversations` | One row per conversation. Keeps a cached last-message preview for the inbox. |
| `chat_participants`  | Membership, role, `last_read_at` (unread counts + receipts), mute, soft leave. |
| `chat_messages`      | Text / attachment / system messages, replies, edit and soft-delete markers.  |
| `chat_attachments`   | Files per message, including `duration_ms` for audio/video.                |

Uniqueness is enforced in the database: one DM per pair (`direct_key`), one thread per order,
and one support thread per client. This makes "open conversation" idempotent even when two
people open it at the same moment.

## Using chat from other pages

```tsx
import { ChatLauncher } from "@/components/chat/ChatLauncher";      // header icon + unread badge
import { OrderChatButton } from "@/components/chat/OrderChatButton"; // "Order chat" on any order view
import { chatHref } from "@/lib/chat/routes";                        // link to /chat or a conversation

<ChatLauncher />
<OrderChatButton orderId={order.id} />
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

### Adding voice recording

The pipeline already accepts audio. `audio/*` is an allowed type, attachments store
`duration_ms`, and `MessageBubble` renders an audio player. A recorder only has to produce a
file:

```ts
const recorder = new MediaRecorder(stream);
// ...collect chunks, then on stop:
const file = new File(chunks, "voice-message.webm", { type: recorder.mimeType });
const res = await uploadChatAttachment(conversationId, file, { durationMs });
if (res.ok) await sendMessage({ conversationId, body: "", attachments: [res.attachment] });
```

Add a hold-to-record button next to the paperclip in `components/chat/Composer.tsx`.

### Other natural next steps

- Typing indicators: a per-conversation Broadcast channel (HMAC-named like the personal ones).
- Message search: a `tsvector` column plus a GIN index on `chat_messages.body`.
- Order status updates posted into order threads as system messages.

## Deploying

1. Apply the migration: `npx supabase db push` (or paste
   `supabase/migrations/20260925100000_chat.sql` into the SQL editor).
2. Make sure Realtime → Settings allows public channels. The chat channels are public but
   unguessable; see the security model above.
3. No new environment variables. Chat uses the existing `APP_SECRET`, Supabase keys and VAPID
   keys.
