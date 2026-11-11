# Handover: 2026-11-04

For whoever picks this up next, including a new Claude account. Read this first, then `README.md` and
`packages/lib/<module>/README.md` for the area you're touching. No passwords or keys are written here;
this says where they live. Facts come from the notes below and a read-only look at the server on
2026-11-04.

**More detail:** the previous account's notes are in
`~/.claude/projects/-Users-saniget-Documents-projects-factory/memory/` (start with `MEMORY.md`). A new
account may not load them automatically, so read them directly. Old plans are in `~/.claude/plans/`.

## Do this first: unfinished work in the working tree

Four files on `drive` have **uncommitted, unchecked** edits:
`packages/lib/orders/create.ts`, `packages/lib/agents/server.ts`, `packages/lib/agents/README.md`,
`packages/ui/order/OrderForm.tsx`.

They do what the owner asked: "when we create an order in the name of an agent, it's their order."
Any new order with an agent, whether staff or a designer creates it, shows in that agent's portal and
earns commission (`commission_eligible: p.agentId !== null`). No migration is needed. Older orders don't earn.

1. Review `git diff`.
2. Run `npx tsc --noEmit -p .` in `apps/client` and `apps/factory`, then `npx eslint` on the changed files
   and `npm run test`.
3. Test a staff order with an agent, and one without.
4. Commit on `drive`, then ask before releasing.

Tell the owner:
- Once rates are set, tagged orders earn even for agents with no login yet. The balance waits for them.
- The client isn't added to the agent's list, so the agent sees the name on the order but not the contact
  details. Ask whether staff-tagged clients should join the list.

**Danger:** `scripts/deploy.sh` builds the working tree, not `main`. Edits like these go live with any
deploy. Check `git status` is clean before deploying. This has already caught us once.

## Working rules from the owner

- **Ask before every release.** Say what goes live and wait for "release it". Migrations need a clear
  go-ahead too ("push db"). Commit on `drive` freely; stop before merging to `dev`.
- **On a release,** list any uncommitted edits and ask whether they ship. Never drop the owner's silently.
- **For a reported bug,** explain and propose. Don't change other features unasked.
- **No Claude attribution** in commits or PRs. **Never run prettier**; the repo has no formatter.
- **Next.js has local changes:** read `node_modules/next/dist/docs/` before relying on an API (`AGENTS.md`).
- **YAGNI:** build only what the task needs.
- **UI:** decide phone and desktop up front (grids on desktop, `FormSheet` for add and edit). Look in the
  design room first (`apps/factory/app/dashboard/design-room/registry.ts`) and reuse what's there. Keep
  wording short and professional.
- **Charts and analysis:** use your own judgement as a pro analyst; don't ask the owner to pick.
- **"Make the servers public"** means forward the Mac's dev servers, not build a test deploy.
- **Pasted messages** may be limited to 4,000 characters, so keep briefs short or put them in a file.

## The apps

Monorepo: `apps/client` (clients, studios, vendors, agents), `apps/factory` (staff, workers, designers),
`packages/lib`, `packages/ui`. Git flow: `drive` → `dev` → `main`, using `--no-ff` merges. Remote:
`git@github.com:vicxtunes/factory.git`. Pushes sometimes fail with a key error or a GitHub 500; check the
agent with `ssh-add -l` and try again.

| What | Where |
| --- | --- |
| Client app | https://www.amingspace.com, port 3001 on the server |
| Staff app | https://factory.amingltd.com, port 3002 on the server |
| Data API | https://api.amingspace.com |

## VPS

DigitalOcean droplet `46.101.15.110`, Ubuntu 24.04, 2 vCPU, 3.8 GB RAM, 77 GB disk. SSH: `ssh aming`, port
**2222**, key `~/.ssh/aming_droplet`, root (port 22 is blocked on the owner's network).

- **Apps:** systemd `aming-client` and `aming-factory`, user `aming`. Settings in
  `/etc/aming-{client,factory}.env`. Releases in `/srv/aming/<app>/releases/<stamp>`, with a `current`
  symlink. Memory limits in `/etc/systemd/system/aming-*.service.d/memory.conf`.
- **Database and backend:** Supabase pieces in Docker, compose in `/srv/aming/supabase`. Containers:
  `supabase-db`, `-auth`, `-rest`, `-storage`, `-envoy`, `realtime-dev.supabase-realtime`. Files are in
  Cloudflare R2 behind the Storage API.
- **Read-only query:** `ssh aming "docker exec -i supabase-db psql -U supabase_admin -d postgres"`.
- **Nginx:** `/etc/nginx/sites-available/aming`, `snippets/aming-proxy.conf`, `conf.d/aming.conf`. Access log
  with timings: `/var/log/nginx/aming.log`. Any new per-IP limit must keep the server's own IP exempt
  (the `$aming_self` map); forgetting this caused an outage on 11-01. Caddy is stopped, not removed.
- **Certificates:** Let's Encrypt via certbot webroot, renewed by `certbot.timer`.
- **DNS:** on Vercel's nameservers. Only the owner can change records.
- **Backups:** `aming-db-backup.timer` runs at 23:30 UTC (`/srv/aming/backup`, see its README), to R2. One-off
  dumps before each migration are in `/root/pre-*.dump`; the latest is
  `/root/pre-agents-202611041418.dump`.
- **Monitoring:** `/srv/aming/monitoring`. Uptime Kuma on `127.0.0.1:3101`, Beszel on `127.0.0.1:3102`. Alerts
  email through Resend SMTP on port 2465 (DigitalOcean blocks 465 and 587).
- **Also on this server, not Aming:** `school-os-*` containers and the `sos.dementa.space` Nginx site. Don't
  touch them. Good School also runs on the owner's Mac, so kill dev servers by port, never by name.

### Deploying

1. Get a go-ahead. Run `git status`; it must be clean, and the merge must have succeeded.
2. Stop dev servers from this repo, then delete `apps/client/.next/dev` and `apps/factory/.next/dev`. Stale
   files there break the production build.
3. **Migrations go first:** back up with `ssh aming "docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc > /root/pre-<name>-<stamp>.dump"`,
   then `node scripts/apply-migration.mjs supabase/migrations/<file>.sql`.
4. Run `scripts/deploy.sh all` (or `client` / `factory`). It builds on the Mac, because the server is too
   small. If the upload drops, tar the standalone build, send it with `rsync --partial`, and run the
   script's switch steps.
5. Rollback: `scripts/deploy.sh rollback client|factory`.

`topup_bonuses` and some functions are owned by `supabase_admin`, so a migration touching them fails with
"must be owner". Check ownership first.

### Local and test environment

- `apps/*/.env.local` points at **QA, the old Supabase project** (`efefpzzuzblroydxamjq`).
- `.env.development.local.vps-is-live` and `/etc/aming-test-*.env.disabled-points-at-live` point at **live**.
  Never restore them as they are.
- **QA holds real push subscriptions.** Run dev with `VAPID_PRIVATE_KEY`, `RESEND_API_KEY` and `EMAIL_FROM`
  empty, or a test can reach a real phone. Migrations reach QA through the Management API, using
  `SUPABASE_ACCESS_TOKEN` from `.env.local`.
- **QA is due to be cancelled around 2026-11-08,** when the safety week ends. That also ends the rollback to
  Supabase, and there's **no other test database yet.** Decide on a replacement first.
- Live HivePay payouts can't be tested on QA (no keys there).

## Secrets: all must carry over

Nothing here needs copying into the repo. Check the new setup can reach:
- `~/.ssh/aming_droplet` and the GitHub key (`~/.ssh/id_ed25519`)
- `/etc/aming-*.env` on the server: HivePay keys, VAPID, Resend, `OPENAI_API_KEY`, `APP_SECRET`, Supabase keys
- `apps/*/.env.local` on the Mac
- Accounts the owner holds: DigitalOcean, Cloudflare R2, Vercel (DNS), Resend, HivePay, OpenAI, GitHub

## Open items

**Agent platform (released 11-04, `main` 4a00581):** `packages/lib/agents/README.md`.
- No agent has a login, and every commission rate is 0%. The sending fee setting is "the agent".
- The owner wants to test in production before anyone joins. No real order has been confirmed since the
  deploy, so the first test order also proves ordering still works.
- Never run for real: a HivePay withdrawal and the fee credit-back, the payment prompt, real pushes and
  emails. Do these with the owner present.
- QA leftovers: inactive "QA Agent One", orders 2026-0534 and 2026-0535, two test clients.
- Rerun the money rules with `packages/lib/agents/commission-check.sql`, on a test database only, inside its
  rolled-back transaction.

**Assistant (v3 live, cap US$1):** a full order through to a real payment, and an order-form review, have
never been seen on live. `dementaacademy@gmail.com` switches the model on Dashboard → Assistant.

**Money:**
- Supreme Media's 1,297,000 needs correcting (phone or reference and date from the CEO); 12 past negative
  adjustments (6,033,000) are unchecked.
- CEO still to enter: opening balances and the approval limit.
- Bill payouts are hidden until HivePay's price list is in `HIVEPAY_SEND_FEES`; never live-tested.
- HivePay's double-transaction claim: waiting for their reference, date, amount and phone.
- **Leave alone:** the 13 Oct 250,000 record. The owner said to keep it, so don't offer to correct it.
- **HivePay rate-limits** per account, shared with live payments. Never burst status calls.

**Others:**
- Product order photos: real upload and the payment block are unverified on live.
- Photo book sheet prices: real prices and materials must come from the owner. Cover Type has no client price.
- Vendors: strict roles gap (opening My Business auto-creates a studio); calendar and invoices not built.
