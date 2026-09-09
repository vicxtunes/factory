# Linking the CLI + fixing migration history drift

Every migration through `20260908120000_clients_agents_products.sql` was
applied by hand via the Supabase SQL editor, never through the CLI (it
wasn't logged in). That means the remote migration-tracking table
(`supabase_migrations.schema_migrations`) has no record of them, even though
the tables/columns/etc. themselves exist. Fix this once, then `db push`
works normally for every migration after.

All three commands below need your Postgres **database password** (not the
`NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` in
`.env.local` — a separate credential from the project's connection info).
Run them yourself in an interactive terminal so the password prompt never
ends up in a chat transcript.

## One-time fix

1. Link this directory to the `factory` project (ref `efefpzzuzblroydxamjq`):
   ```bash
   npx supabase link --project-ref efefpzzuzblroydxamjq
   ```

2. Mark the already-applied migrations as applied, without re-running them:
   ```bash
   npx supabase migration repair --status applied \
     20260902150700 20260902150800 20260905120000 20260908120000 --linked
   ```

3. Confirm the remote history now matches local, with only the newest
   migration left pending:
   ```bash
   npx supabase migration list --linked
   ```

4. Push the pending migration:
   ```bash
   npx supabase db push --linked
   ```

## Going forward

Once linked, new migrations should go through `supabase db push` instead of
pasting into the SQL editor by hand — that's what keeps this table from
drifting again. `RUN_THIS_IN_SUPABASE.sql` (the copy-paste fallback for when
the CLI isn't usable) can keep existing as a backup path, but treat
`supabase db push` as the primary one from here on.
