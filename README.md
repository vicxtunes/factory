# Factory Order Tracker

Internal production-tracking system for a photo-printing factory. Standalone from
the main company system — fed by manual entry at reception. See
`Factor Tracker Plan.md` for the full spec.

## Surfaces

Two apps on one database:

| App / route              | Who                              | Auth                           |
| ------------------------ | --------------------------------- | ------------------------------- |
| factory: `/dashboard`    | Receptionist / Supervisor / Boss  | Supabase Auth (email + pass)   |
| factory: `/factory`      | Production floor                  | Worker name + personal PIN     |
| factory: `/graphics`     | Graphic designers                 | Designer name + personal PIN   |
| client: `/` (whole app)  | Clients                           | Phone number (+ optional PIN)  |

Clients sign in with just a phone number — a known number logs them straight
in (or asks for their PIN, if they've set one from Settings); a new number
creates the account. Security is opt-in: no PIN is required by default.

Order intake lives in the dashboard (`/dashboard/orders/new`): the initiator
picks whether an order goes straight to the factory or to a specific graphics
designer first (with an optional brief) — the designer attaches their files
from `/graphics` and marks it done, which auto-forwards the order to the
factory board.

Receptionist and supervisor share full write access (client/agent/product
catalog, worker + designer management, item assignment, status overrides).
Boss sees the same views read-only, plus is the only role that can create new
dashboard accounts (`/dashboard/admins`).

## Stack

Next.js 16 (App Router) · Tailwind v4 · Supabase (Postgres + Realtime + Auth) ·
Docker.

## Repository layout

One repository, npm workspaces:

```
apps/
  factory/        staff app — dashboard, factory floor, graphics, display  (factory.<domain>)
  client/         client portal — showroom, orders, wallet, invoices        (client.<domain>)
packages/
  lib/            @repo/lib — business logic, data access, auth, types
  ui/             @repo/ui  — shared React components and UI primitives
supabase/         migrations for the one shared database
scripts/          tests and asset generation
```

Apps import shared code by package name (`@repo/lib/orders/create`,
`@repo/ui/Button`); `@/` inside an app still means that app's own folder.
Dependencies point one way: apps → `@repo/ui` → `@repo/lib`; the two apps
never import each other. Where they must talk, they do it over HTTP: the
factory app links to the client app via `NEXT_PUBLIC_CLIENT_ORIGIN` and tells
it when the catalog changes (`POST /api/catalog-changed`, `REVALIDATE_SECRET`).

## Local setup

1. `npm install`
2. Copy each app's `.env.example` to `.env.local` (`apps/factory/`, `apps/client/`) and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` — from the Supabase project API settings
   - `APP_SECRET` — `openssl rand -hex 32` (same value in both apps)
   - `NEXT_PUBLIC_CLIENT_ORIGIN` (factory) — e.g. `http://localhost:3001`
   - `REVALIDATE_SECRET` — `openssl rand -hex 32` (same value in both apps)
3. Apply the schema:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   psql "<connection string>" -f supabase/seed.sql   # optional dev data
   ```
   (or paste `supabase/migrations/*.sql` into the Supabase SQL editor in order)
4. Create dashboard users in Supabase Auth, then insert their roles:
   ```sql
   insert into profiles (id, role, full_name) values ('<uuid>', 'receptionist', 'Name');
   insert into profiles (id, role, full_name) values ('<uuid>', 'supervisor', 'Name');
   insert into profiles (id, role, full_name) values ('<uuid>', 'boss', 'Name');
   ```
5. From the repo root: `npm run dev` → factory on http://localhost:3000,
   `npm run dev:client` → client portal on http://localhost:3001

Seeded worker PINs (dev only): Amina `1111`, Kofi `2222`, Lucia `3333`, Sam `4444`.
Seeded designer PINs (dev only): Tola `5555`, Priya `6666`.

## Data model

`orders` → `order_items` (kanban unit) · `workers` (PIN-hashed) ·
`notifications` (completed / delayed events, populated by a DB trigger).
RLS: anon may read `orders` / `order_items` / `notifications`; all writes go
through the service-role key in server actions. Worker PIN hashes are never
exposed to the client (`workers_public` view).

## Docker

```bash
cp apps/factory/.env.local .env   # compose reads .env (add REVALIDATE_SECRET etc.)
docker compose up --build         # factory on :3000, client on :3001
```
`NEXT_PUBLIC_*` values are build args (inlined at build time); the rest load at
runtime from `.env`.

## Scripts

All run from the repo root:

- `npm run dev` / `npm run dev:client` — dev server for the factory / client app
- `npm run build` — production build of both apps (`build:factory`, `build:client` for one)
- `npm run lint` — ESLint over the whole repo
- `npm test` — unit tests for the pure `core/` modules in `packages/lib`
