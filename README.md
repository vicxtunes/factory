# Factory Order Tracker

Internal production-tracking system for a photo-printing factory. Standalone from
the main company system — fed by manual entry at reception. See
`Factor Tracker Plan.md` for the full spec.

## Surfaces

| Route         | Who                              | Auth                           |
| ------------- | --------------------------------- | ------------------------------- |
| `/dashboard`  | Receptionist / Supervisor / Boss  | Supabase Auth (email + pass)   |
| `/factory`    | Production floor                  | Google (linked once with old PIN) |
| `/graphics`   | Graphic designers                 | Google (linked once with old PIN) |
| `/client-side`| Clients                           | Google (Supabase Auth) + phone number |

### Google sign-in (clients, workers, designers)

Everyone except dashboard staff signs in with **Continue with Google**
(Supabase Auth); there are no PIN or phone-only logins any more. The Google
account is then linked to the record it belongs to:

- **Clients** — after Google, enter a phone number: a known number links to
  that existing client (orders/history carry over, Gmail added); a new number
  creates the client. No approval. (Clients who once set a PIN must still enter
  it when linking.) `client_identities`.
- **Workers / designers** — after Google, pick your name and enter your old PIN
  **once** to connect. After that only Google works. `worker_identities`,
  `designer_identities`. Failed PIN attempts are throttled (`auth_attempts`).
- **Workers not on the list** can request access; supervisors/boss approve on
  the dashboard's Workers page (`worker_access_requests`). "Reset Google" on the
  Workers/Designers tables detaches an account so a different one can be linked.

Migrations: `20260920120000_client_google_auth.sql`,
`20260920140000_google_only_login.sql`. One-time setup:

1. Google Cloud Console → OAuth client (Web). Authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`. Authorized JavaScript
   origins: your production origin and `http://localhost:3000` (for the
   on-device account picker).
2. Supabase → Authentication → Providers → Google: enable, paste client ID +
   secret.
3. Supabase → Authentication → URL Configuration: set Site URL and add
   `<origin>/auth/callback` to Redirect URLs (plus localhost / Codespaces).
4. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to the same client ID.

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
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — Google OAuth Web client ID (see "Google sign-in" below)
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
