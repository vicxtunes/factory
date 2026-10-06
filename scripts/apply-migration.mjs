// Applies one migration file to the Supabase project, in one transaction,
// through Supabase's Management API: no database password and no dashboard.
//
//   node scripts/apply-migration.mjs supabase/migrations/<file>.sql
//
// Needs SUPABASE_ACCESS_TOKEN (a personal access token, supabase.com →
// Account → Access tokens) and SUPABASE_PROJECT_ID, from the environment or
// apps/factory/.env.local. Migrations were always applied by hand (see
// supabase/MIGRATIONS.md), so this runs exactly the file it's given and
// nothing else.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function env(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(`${root}apps/factory/.env.local`, "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") || undefined;
  } catch {
    return undefined;
  }
}

const file = process.argv[2];
const token = env("SUPABASE_ACCESS_TOKEN");
const project = env("SUPABASE_PROJECT_ID");
if (!file) throw new Error("Which migration? node scripts/apply-migration.mjs supabase/migrations/<file>.sql");
if (!token || !project) throw new Error("Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID (apps/factory/.env.local).");

const sql = readFileSync(file, "utf8");
const res = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  // All or nothing: a failure leaves the database as it was.
  body: JSON.stringify({ query: `begin;\n${sql}\ncommit;` }),
});
const body = await res.text();
if (!res.ok) {
  console.error(`Not applied (${res.status}): ${body}`);
  process.exit(1);
}
console.log(`Applied ${file}`);
