# Running the client portal on Cloudflare

The client app (`apps/client`) can run on **Cloudflare Workers** through
[OpenNext for Cloudflare](https://opennext.js.org/cloudflare), alongside Vercel. Vercel keeps
serving `client.<domain>` until you switch the domain over.

Only the hosting moves. The app still uses **Supabase** for the database, sign-in, chat realtime
and storage, exactly as on Vercel.

## What's here

| File | What it does |
| --- | --- |
| `wrangler.jsonc` | The Worker (`aming-client`): Node compatibility, static files, the caches below, image resizing |
| `open-next.config.ts` | Next's data cache in **R2**, its cache tags in **KV**: so `revalidateTag("catalog")` from `/api/catalog-changed` keeps working |
| `package.json` scripts | `cf:build`, `cf:preview` (local, Cloudflare's runtime), `cf:deploy` |

Next.js is 16.3.8 or newer (the adapter's minimum) in both apps.

## Plan needed

The built Worker is about **5.7 MB compressed**. That's over the free plan's 3 MB limit, so the
account needs **Workers Paid ($5/month)**. It includes far more requests than the portal uses.

## One-time setup (in your Cloudflare account)

Run these from the repo root; the `!` prefix runs them in the Claude Code session.

1. Sign in: `! npx wrangler login -c apps/client/wrangler.jsonc`
2. The data-cache bucket: `! npx wrangler r2 bucket create aming-client-cache`
3. The cache-tags store: `! npx wrangler kv namespace create aming-client-tags`.
   Copy the printed `id` into `apps/client/wrangler.jsonc` in place of `REPLACE_WITH_KV_NAMESPACE_ID`.
4. Secrets (the same values as on Vercel). Each command asks for the value; it's never stored in
   the repo:
   ```
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY -c apps/client/wrangler.jsonc
   npx wrangler secret put APP_SECRET -c apps/client/wrangler.jsonc
   npx wrangler secret put REVALIDATE_SECRET -c apps/client/wrangler.jsonc
   npx wrangler secret put VAPID_PRIVATE_KEY -c apps/client/wrangler.jsonc
   ```

## Deploying

The `NEXT_PUBLIC_*` values are built into the app, so they must be set **when building**. Put
them in `apps/client/.env.production.local`, which git ignores:

```
NEXT_PUBLIC_SUPABASE_URL=…            # as on Vercel
NEXT_PUBLIC_SUPABASE_ANON_KEY=…       # as on Vercel
NEXT_PUBLIC_VAPID_PUBLIC_KEY=…        # as on Vercel
NEXT_PUBLIC_CLIENT_ORIGIN=https://aming-client.<your-account>.workers.dev   # this deployment's own address
NEXT_PUBLIC_STUDIOS=1                 # only where studios should be on
```

Then: `npm run cf:deploy -w @repo/client`. The first deploy prints the address
(`https://aming-client.<your-account>.workers.dev`).

### Before testing the preview address

- **Google sign-in:** in Supabase → Authentication → URL Configuration, add the workers.dev
  address to the allowed redirect URLs.
- **Catalog refresh:** the staff app tells *one* client app when the catalog changes
  (`NEXT_PUBLIC_CLIENT_ORIGIN` on the staff app, today Vercel's). Until you switch over, catalog
  edits reach the Cloudflare preview only when its cache expires.

## Switching client.<domain> to Cloudflare

When the preview looks right:
1. Add `client.<domain>` as a **Custom Domain** on the Worker (the domain's DNS must be on Cloudflare).
2. Set `NEXT_PUBLIC_CLIENT_ORIGIN=https://client.<domain>`, then rebuild and deploy.
3. Remove the domain from the Vercel client project.

Vercel stays untouched until step 3, so going back is just pointing the domain back.

## Local check without an account

`npm run cf:preview -w @repo/client` builds and runs the Worker in Cloudflare's own runtime
(workerd) on your machine. R2 and KV are simulated locally.

What was checked here (2026-10-03, with placeholder Supabase values):
- The build completes.
- The offline page and app manifest are served instantly.
- The home, showroom, product and studio pages render, and the Supabase client makes real
  requests from inside the Worker.
