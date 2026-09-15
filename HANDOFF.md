# Handoff — 2026-09-15

Written before moving to a new codespace. Read this first, then `README.md`
(setup/stack) — `Factor Tracker Plan.md` is the **original v1 spec** and is
now stale; the real system has grown well past it (see "What's actually
built" below).

## State right now

- `main` is up to date with `origin/main`; everything through PR #12 is
  merged. Working tree clean, `npx tsc --noEmit` passes.
- Branch `add-media-download-all` (this session's branch) is fully merged
  into `main` — safe to delete locally/remotely, nothing outstanding on it.
- Stale local branches from old merged PRs, safe to delete:
  `switch-media-to-supabase-storage`. (Don't force-delete without checking
  `git branch --merged main` yourself first, just in case.)
- No open PRs, no TODO/FIXME markers in `app`/`lib`/`components`.

## Environment (new codespace will need this again)

- `.env.local` **is currently populated** for Supabase
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`) and Google Drive
  (`GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_REFRESH_TOKEN`,
  `GOOGLE_DRIVE_FOLDER_ID`). `CLOUDINARY_*` keys are present but **empty** —
  expected, media moved from Cloudinary to Supabase Storage (PR #7). A prior
  session found `.env.local` missing/empty entirely at times in this
  codespace — verify values actually exist before assuming dynamic routes
  work; if empty, every dynamic route 500s in dev via `proxy.ts`.
  `.env.local` is gitignored, so **copy it over manually** to the new
  codespace (or re-derive from Supabase/Google dashboards) — it will not
  come from `git clone`.
- Supabase CLI auth (`supabase login` / `SUPABASE_ACCESS_TOKEN`) does **not**
  persist across codespace rebuilds — expect `LegacyPlatformAuthRequiredError`
  on `supabase migration list --linked` / `db push --linked` until you log in
  again. Production project ref: `efefpzzuzblroydxamjq` ("factory", org
  `suttrfqkuiwrffijshpl`, eu-central-1).
- `next build` reliably OOM-kills in resource-constrained codespaces (dies
  silently at "Creating an optimized production build…"). Use
  `npx tsc --noEmit` + `npx eslint` + a short `next dev` smoke test instead;
  rely on the Vercel preview build for a real production-build check.
- Newly opened dev-server ports on Codespaces can 404 for several
  seconds–tens of seconds after `next dev` starts before the port-forwarding
  tunnel registers — don't assume the port is dead if the first request
  fails. If you run dev on a non-default port, add `localhost:<port>` to the
  allowed origins in `next.config.ts` (Server Actions same-origin check).

## What's actually built (well past the original plan)

Roles are now **Receptionist / Supervisor / Boss** (dashboard, shared write
access, boss is read-only + super-admin), **Worker** (`/factory`, PIN),
**Graphics designer** (`/graphics`, PIN) — the original plan's `/intake` +
two-role dashboard was superseded by this. Chronological feature history
(newest first, see `git log --oneline` for full detail):

- Media ownership fixes, notes/export fixes, CRUD drawers, Support page (PR
  #12).
- Receptionist worker-access split, order audit log, notes threads, full
  order editing (PR #11).
- Unified order card design; supers can hide with-designer items (PR #10).
- "Download all" zip button for order-item media (PR #8), on top of the
  Cloudinary → Supabase Storage media migration (PR #7).
- Client de-duplication layer (`find_client_candidates` SQL fn, trigram +
  exact-match on name/email/phone) + shared manager/designer order-creation
  flow + Orders page filter/table redesign + FCFS-style display ordering
  (newest on top, worked from the bottom) (PR #4, #5, #6).
- Boss made super-admin, password/PIN resets, catalog locked to boss;
  receptionist/designer roles + Cloudinary media (PRs #1–3).

Full narrative detail on the client-dedupe + order-flow + Orders-page work
is in Claude Code's memory (`client-dedupe-and-order-refactor`,
`env-and-supabase-access`) if you're continuing with Claude Code in the new
codespace — it should carry over automatically since memory isn't tied to
this working directory.

## Known gaps / not done

- Nothing currently tracked as in-progress or blocked — this session ended
  with a clean, merged, typechecked tree. Next work has not been scoped yet;
  pick it up from wherever the boss/product feedback lands next.

## Quick start in the new codespace

```bash
npm install
# copy your .env.local over, or recreate it per README.md
npm run dev   # http://localhost:3000
```
