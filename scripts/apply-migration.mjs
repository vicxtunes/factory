// Applies one migration file to the live database (Postgres in Docker on the
// server, `ssh aming`), in one transaction:
//
//   node scripts/apply-migration.mjs supabase/migrations/<file>.sql
//
// It runs as the `postgres` role, which owns the app's tables and functions
// (as Supabase's Management API did before the move on 2026-11-01), then
// tells the data API (PostgREST) to reload the schema so new columns and
// functions answer at once. Migrations were always applied by hand (see
// supabase/MIGRATIONS.md), so this runs exactly the file it's given and
// nothing else.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const file = process.argv[2];
if (!file) throw new Error("Which migration? node scripts/apply-migration.mjs supabase/migrations/<file>.sql");

const sql = readFileSync(file, "utf8");
const psql = (input) =>
  spawnSync(
    "ssh",
    ["aming", "docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q"],
    { input, stdio: ["pipe", "inherit", "inherit"] },
  ).status;

// All or nothing: a failure leaves the database as it was.
if (psql(`begin;\nset local role postgres;\n${sql}\n;\ncommit;\n`) !== 0) {
  console.error(`Not applied: ${file}`);
  process.exit(1);
}
psql("notify pgrst, 'reload schema';\n");
console.log(`Applied ${file}`);
