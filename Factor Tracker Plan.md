# Factory Order Tracker — Implementation Plan for Claude Code

## 1. What we're building

A standalone "mini system" that sits next to the main company system. It has four user-facing surfaces, one per role:

1. **`/intake`** — receptionist logs orders and their line items.
2. **`/factory`** — mobile-first production queue for workers: view items, update status, flag delays, mark complete/delivered.
3. **`/dashboard`** — shared route for supervisor and boss. Supervisor gets full write access (manage workers, assign items, override status); boss gets the same visibility, read-only.
4. **Notification feed** — in-`/dashboard` list of completion/delay events (real mobile push is a v2 item — see Section 7).

No integration with the main system for v1 — deliberately separate, fed by manual double-entry at intake. Real sample data from the main system showed orders are multi-item, and that `urgency` / `production_status` already exist as fields there — this system exposes/extends that, rather than inventing tracking from scratch.

## 2. Stack

- **Next.js (App Router)** + **Tailwind**
- **Supabase** — Postgres, Realtime (live board + dashboard updates), Auth (supervisor/boss login), Edge Functions (notification triggers, PIN hashing)
- **Docker** for deployment, same pattern as your other products

## 3. Roles

| Role | Screen | Login | Can do |
|---|---|---|---|
| Receptionist | `/intake` | shared PIN (env var) | Create orders + items |
| Worker | `/factory` (mobile) | pick name + personal PIN, remembered on device | View queue, filter to "assigned to me," update production_status, flag delays + reason, mark complete/delivered |
| Supervisor | `/dashboard` | Supabase Auth (email/password) | Everything boss sees, plus: add/edit/deactivate workers, set a worker's station label, assign specific order items to specific workers, override any status |
| Boss | `/dashboard` | Supabase Auth (email/password) | Read-only — full visibility across all orders/items, notification feed, no editing |

Supervisor and boss share one route; the account's role determines whether management controls (worker list, assign-to-worker dropdown, station editor) render or are hidden. One codebase for both, less duplicate work.

**Default behavior on deactivating a worker:** their currently-assigned items are automatically set back to unassigned (`assigned_worker_id = null`), rather than sitting stuck on an inactive worker. Supervisor can then reassign manually from the now-unassigned list.

## 4. Data model

### `orders`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK, default `gen_random_uuid()` | |
| `order_no` | text | human-readable reference from the main system, e.g. "2026-3956" — use this everywhere in the UI, not the UUID |
| `client_name` | text | |
| `delivery_date` | date | the deadline production is working toward |
| `status` | text | order-level status from the main system, e.g. "At Factory" — only orders at this stage should appear on the board |
| `order_notes` | text, nullable | |
| `media_link` | text, nullable | link to where the photos for this order live (Google Drive, Dropbox, shared folder, etc.) — no files are hosted in this system |
| `media_notes` | text, nullable | access instructions, e.g. "ask Agent Jeff for permission" or a folder password |
| `created_at` | timestamptz, default `now()` | |
| `updated_at` | timestamptz, default `now()` | |

### `order_items`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK, default `gen_random_uuid()` | |
| `order_id` | uuid, FK → `orders.id` | |
| `product` | text | e.g. "Photo Books" |
| `product_type` | text | e.g. "Photo Book Hard Cover Pro" |
| `qty` | int | |
| `size` | text, nullable | e.g. "12 by 12" |
| `cover_type` | text, nullable | |
| `lamination_type` | text, nullable | |
| `box_type` | text, nullable | |
| `urgency` | enum: `normal`, `urgent`, `rush` | reused directly from the main system's field |
| `item_notes` | text, nullable | |
| `production_status` | enum: `not_started`, `in_production`, `quality_check`, `ready_for_pickup`, `completed` | drives the kanban column |
| `is_delayed` | boolean, default `false` | flag, independent of `production_status` — an item can be delayed at any stage |
| `delay_reason` | text, nullable | required when `is_delayed = true` |
| `assigned_worker_id` | uuid, FK → `workers.id`, nullable | supervisor's per-item task assignment |
| `media_link` | text, nullable | only set if this item's photos come from a different source than the order-level link — leave null to fall back to the order's `media_link` |
| `updated_by_worker_id` | uuid, FK → `workers.id`, nullable | stamps who last changed status/delay |
| `created_at` | timestamptz, default `now()` | |
| `updated_at` | timestamptz, default `now()` | |

### `workers`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK, default `gen_random_uuid()` | |
| `name` | text | |
| `pin_hash` | text | set by supervisor when adding the worker; never store raw PIN |
| `station` | text, nullable | e.g. "Printing", "Binding", "Lamination" — supervisor-assigned label, not enforced access control |
| `active` | boolean, default `true` | deactivate instead of hard-delete to preserve history on past `updated_by_worker_id` / `assigned_worker_id` references |
| `created_at` | timestamptz, default `now()` | |

### `notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK, default `gen_random_uuid()` | |
| `order_item_id` | uuid, FK → `order_items.id` | |
| `event_type` | enum: `completed`, `delayed` | |
| `message` | text | e.g. "Order 2026-3956, Photo Books, marked complete" |
| `created_at` | timestamptz, default `now()` | |

**Explicitly left out** (billing/financial, not the factory's concern): `total_amount`, `cash_paid`, `balance`, `payment_status`, `cost_price`, `discount`, `discount_amount`, `original_amount`, `agent`, `sector`.

Index `order_items` on `(production_status, urgency, order_id)`. Enable Realtime on `orders`, `order_items`, and `notifications`.

Trigger (DB function or Edge Function): on `order_items` update where `production_status` changes to `completed`, or `is_delayed` flips to `true`, insert a row into `notifications`.

## 5. Screens

### `/intake` — Receptionist order entry
- Order-level fields: order number, client name, delivery date, order notes, media link (URL to the photo folder), media notes (access instructions).
- Repeatable item rows: product, product type, qty, size, cover type, lamination type, box type, urgency (default "normal"), item notes, optional item-level media link override (only needed if an item's photos come from a different source).
- Submit creates the order + items together, clears the form, shows confirmation.
- Gated by shared PIN.

### `/factory` — Production board (mobile-first)
- Kanban columns by `production_status`: **Not Started → In Production → Quality Check → Ready**. `completed` items drop off or collapse into a "done today" section.
- "Assigned to me / All" toggle at the top — filter only, not access control.
- Cards (per item, not per order): order number, client name, product/product type, qty, size, delivery date, urgency badge (normal/amber/red), a delay flag if `is_delayed`, item notes, and a "View Photos" button that opens the item's media link (falling back to the order's media link if the item has none) in a new tab, alongside any media notes.
- Sort within column: rush → urgent → normal, then delivery date ascending.
- Tap to advance status; a separate "flag delay" action prompts for a reason and sets `is_delayed` + `delay_reason` without changing the column.
- Marking complete stamps `updated_by_worker_id` and fires the notification trigger.
- Realtime subscription, no manual refresh. Large touch targets, legible from a few feet away.

### `/dashboard` — Supervisor & Boss
- Full order/item list with filters (status, urgency, delayed, assigned worker, station).
- Notification feed: live list of completion/delay events, newest first.
- **Supervisor only:** worker management panel — add worker (name + PIN), edit station label, deactivate (auto-unassigns their items), assign/reassign specific items to a worker, override any item's status directly.
- **Boss:** identical views, all management controls hidden/disabled.

## 6. Build order (today)

1. Scaffold Next.js app, connect Supabase, run migrations for `orders`, `order_items`, `workers`, `notifications` + enums, set up Supabase Auth for supervisor/boss accounts.
2. Build `/intake` with repeatable item rows → insert order + items.
3. Build `/factory`: query + Realtime, kanban render, status/delay actions, assigned-to-me filter.
4. Build the completion/delay → `notifications` trigger.
5. Build `/dashboard`: shared view for both roles, role-gated management panel for supervisor (worker CRUD, station labels, assignment, overrides), read-only for boss.
6. Apply your existing design system (gradient-navy header strip, SectionLabel eyebrows, amber reserved for the intake submit button, tabular-nums for qty/dates).
7. Dockerize using your standard setup and deploy alongside your other products.

## 7. Explicitly out of scope for v1 (call these out to your boss)

- No file hosting for photos — the system stores a link to wherever the photos already live (Google Drive, shared folder, etc.), not the files themselves. If that ever needs to change (e.g. centralizing storage), that's a real infra decision, not a quick add-on.
- No integration with the main system's database or API (manual double-entry) — though `urgency`/`production_status` already existing there means a future read-only export/API could automate this
- No real mobile push notifications (needs an installable app or PWA + service worker) — v1 uses an in-app notification feed instead; email-via-Edge-Function is an easy next step after that
- No historical reporting/analytics beyond the live notification feed
- No customer-facing status page
- No billing/payment data anywhere in this system

---

## Prompt to paste into Claude Code

> I'm building a small internal order-tracking system for a photo printing factory, separate from our main company system. Stack: Next.js (App Router), Tailwind, Supabase (Postgres + Realtime + Auth + Edge Functions), deployed via Docker.
>
> Data model:
> - `orders` (order_no, client_name, delivery_date, status, order_notes, media_link, media_notes)
> - `order_items` (order_id FK, product, product_type, qty, size, cover_type, lamination_type, box_type, urgency: normal/urgent/rush, item_notes, production_status: not_started/in_production/quality_check/ready_for_pickup/completed, is_delayed boolean, delay_reason, assigned_worker_id FK nullable, updated_by_worker_id FK nullable, media_link nullable override)
> - No file storage/upload anywhere — media_link is just a URL to wherever the photos already live (Drive, Dropbox, shared folder). Falls back from item-level to order-level link if the item has none set.
> - `workers` (name, pin_hash, station text nullable, active boolean default true)
> - `notifications` (order_item_id FK, event_type: completed/delayed, message, created_at)
>
> Add an index on order_items (production_status, urgency, order_id). Enable Realtime on orders, order_items, notifications. Add a DB trigger or Edge Function: when an order_item's production_status changes to completed, or is_delayed flips to true, insert a row into notifications. When a worker is deactivated, set assigned_worker_id to null on all their currently-assigned items.
>
> Build four things:
> 1. `/intake` — receptionist form (shared PIN from env var) to create an order (including media_link and media_notes) with one or more repeatable line items in one submit (each item can optionally override the media link).
> 2. `/factory` — mobile-first kanban board (Not Started / In Production / Quality Check / Ready) of order_items, with an "assigned to me / all" filter, urgency-based sort and color, a status-advance button, a separate "flag delay" action that prompts for a reason, and a "View Photos" button that opens the item's media_link (or the order's, if the item has none) in a new tab. Workers log in by picking their name + personal PIN, remembered on device. Realtime updates, no manual refresh.
> 3. `/dashboard` — shared route for supervisor and boss via Supabase Auth (email/password), gated by a role on the account. Both see: full order/item list with filters (status, urgency, delayed, assigned worker, station) and a live notification feed. Supervisor additionally sees a worker management panel: add worker (name + PIN, hashed), edit station label, deactivate worker, assign/reassign items to workers, override any item's status. Boss sees the same views with all management controls hidden.
>
> Start by scaffolding the project and the full Supabase schema (tables, indexes, Realtime, trigger, Auth setup), then build `/intake`, then `/factory`, then `/dashboard`.