# Factory Order Tracker

Internal production-tracking system for a photo-printing factory. Standalone from
the main company system — fed by manual entry at reception. See
`Factor Tracker Plan.md` for the full spec.

## Surfaces

| Route         | Who              | Auth                         |
| ------------- | ---------------- | ---------------------------- |
| `/intake`     | Receptionist     | Shared PIN (`INTAKE_PIN`)    |
| `/factory`    | Production floor | Worker name + personal PIN   |
| `/dashboard`  | Supervisor / Boss| Supabase Auth (email + pass) |

Supervisor has full write access (worker management, assignment, status
overrides). Boss sees the same views read-only.

## Stack

Next.js 16 (App Router) · Tailwind v4 · Supabase (Postgres + Realtime + Auth) ·
Docker.

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` — from the Supabase project API settings
   - `INTAKE_PIN` — any 4–8 digit code for the receptionist
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
   insert into profiles (id, role, full_name) values ('<uuid>', 'supervisor', 'Name');
   insert into profiles (id, role, full_name) values ('<uuid>', 'boss', 'Name');
   ```
5. `npm run dev` → http://localhost:3000

Seeded worker PINs (dev only): Amina `1111`, Kofi `2222`, Lucia `3333`, Sam `4444`.

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
