# Factory Order Tracker

Internal production-tracking system for a photo-printing factory. Standalone from
the main company system — fed by manual entry at reception. See
`Factor Tracker Plan.md` for the full spec.

## Surfaces

| Route         | Who                              | Auth                           |
| ------------- | --------------------------------- | ------------------------------- |
| `/dashboard`  | Receptionist / Supervisor / Boss  | Supabase Auth (email + pass)   |
| `/factory`    | Production floor                  | Worker name + personal PIN     |
| `/graphics`   | Graphic designers                 | Designer name + personal PIN   |

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

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` — from the Supabase project API settings
   - `APP_SECRET` — `openssl rand -hex 32`
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
5. `npm run dev` → http://localhost:3000

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
cp .env.local .env          # compose reads .env
docker compose up --build
```
`NEXT_PUBLIC_*` values are build args (inlined at build time); the rest load at
runtime from `.env`.

## Scripts

- `npm run dev` — dev server
- `npm run build` / `npm start` — production build
- `npm run lint` — ESLint
