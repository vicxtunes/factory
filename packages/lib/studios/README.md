# Studios module

Every Aming client is a photographer or studio owner. **My Business** gives each of them their own
business inside the system: their clients, quotations, bookings, projects and deliveries (built
in later phases, see the My Business brief in Notion). Aming gains production orders from their
work.

A studio is a **tenant** (packages/lib/tenancy) owned by one client. Everything a studio
creates is tagged with its tenant id.

- **Opened, not pre-created.** A client's studio is created the first time they open
  **My Business**, named after them. Opening it again, or in two tabs at once, gives the same studio.
- **Business profile.** Name, phone, email and address: what the studio's documents and
  customers will show. The owner edits it on `/studio`.
- **Its own brand.** A studio's public pages carry only its brand: its logo and its color
  (`core/brand.ts`: ready-made colors, or its own made readable under white text), set over
  Aming's orange, plus its own tab title, icon and install manifest (apps/client `[slug]/layout.tsx`).
  Chosen on the Business profile page; until then, the neutral default.
- **Boss oversight.** The boss sees every studio at `/dashboard/studios`. Supervisors and
  receptionists don't.

## Who reaches what

| Who | Can |
| --- | --- |
| Signed-in client | Open and edit **their own** studio. No action takes a studio id: the studio always comes from the session, so no client can name another's. |
| Boss | See every studio and its profile (read-only). |
| Other staff | Nothing here. |

Studio separation is enforced on the server. Clients sign in with a cookie session, not a
database login, and `tenants` has row-level security with no policies, so only the server
(service role) reads or writes it.

## Release switch

While there's little in a studio yet, it's off unless `NEXT_PUBLIC_STUDIOS=1` is set for the
client app (`feature.ts`): the menu item is hidden and `/studio` is a 404. Set it on the preview;
turn it on in production when studios are released. The boss's pages don't depend on it.

## Layout

```
packages/lib/studios/
  core/              Pure: Studio records, zod schemas (profile, id). Tests: npm test.
  ports.ts           StudioStore: what a host must provide. StudioError.
  service.ts         class StudioService: open (create on first open), updateProfile, list, get.
  service.test.ts    The service against an in-memory store.
  policy.ts          canViewAllStudios: the boss.
  adapters/supabase/store.ts   Studios as owned rows of `tenants`; Aming's default tenant is never one.
  server.ts          The wired service; requireStudio (pages), studioOfCaller (actions, any module),
                     requireStudiosOversight (boss pages).
  actions.ts         saveMyStudioProfile (session → zod → service).
  feature.ts         STUDIOS_ENABLED.
packages/ui/studios/  StudioProfileForm (client), StudiosTable (boss).
apps/client/app/studio/                       My Business.
apps/factory/app/dashboard/(app)/studios/     The boss's list and one studio.
supabase/migrations/20261003100000_studios.sql
```

## Data

`tenants` gains `owner_client_id` (unique: one studio per client; a client who owns a studio
can't be deleted), `phone`, `email`, `address`, length checks, and an `updated_at` trigger. A
tenant that isn't the default must have an owner. Additive only: no existing rows change.

## Testing

- `npm test`: profile and id schemas, the boss-only policy, and the service (opens once, each
  client their own, saving changes only that studio, newest first).
- Checked against a local Postgres with every migration applied, through PostgREST:
  constraints (one studio per owner, owner required, lengths, owner can't be deleted), and the
  Supabase store + service: concurrent opens give one studio, profile save, boss list excludes
  Aming, Aming's tenant can't be changed through the store.

## For other modules

Studio-owned modules (customers, …) get the caller's studio from `server.ts`:
`requireStudio()` on pages and `studioOfCaller()` in actions. Both return `{ session, studio,
scope }`; pass `scope` (`studioScope(studio)`: the studio's tenant id, currency, locale and time
zone) to the module. Neither takes an id from the browser.

## Next

Packages & Services, then Billing (quotations, invoices, payments), take the studio's
`TenantScope` and store their rows with its tenant id. Studio customers will reach their
projects, orders and photos through a private link (Customer Portal & Delivery).
