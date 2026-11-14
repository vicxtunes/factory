import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { can, changes, cleanMap, levelsOf, resolveAccess, SECTION_KEYS, type AccessMap, type Section } from "./core";

test("the boss has every section at manage, whatever is stored", () => {
  const access = resolveAccess(true, { orders: "none" }, { accounts: "none" });
  for (const s of SECTION_KEYS) assert.equal(access[s], "manage", s);
});

test("a person gets their role's sections, their own on top, and none for the rest", () => {
  const access = resolveAccess(false, { orders: "manage", clients: "view" }, { clients: "manage", expenses: "view", orders: "none" });
  assert.equal(access.orders, "none");
  assert.equal(access.clients, "manage");
  assert.equal(access.expenses, "view");
  assert.equal(access.accounts, "none");
});

test("no role and nothing of their own: nothing", () => {
  const access = resolveAccess(false, null, undefined);
  assert.ok(SECTION_KEYS.every((s) => access[s] === "none"));
});

test("manage reaches view; view doesn't reach manage", () => {
  const access = resolveAccess(false, { orders: "manage", clients: "view" }, {});
  assert.equal(can(access, "orders"), true);
  assert.equal(can(access, "orders", "manage"), true);
  assert.equal(can(access, "clients"), true);
  assert.equal(can(access, "clients", "manage"), false);
  assert.equal(can(access, "accounts"), false);
});

test("stored maps are cleaned: unknown sections and levels go, view on an on/off section is none", () => {
  assert.deepEqual(cleanMap({ orders: "manage", nonsense: "manage", clients: "owner", bill_approval: "view" }), { orders: "manage", bill_approval: "none" });
  assert.deepEqual(cleanMap(null), {});
  assert.deepEqual(cleanMap(["orders"]), {});
  assert.deepEqual(levelsOf("bill_approval"), ["none", "manage"]);
  assert.deepEqual(levelsOf("orders"), ["none", "view", "manage"]);
});

test("changes lists only what moved", () => {
  assert.deepEqual(changes({ orders: "view", clients: "manage" }, { orders: "manage", clients: "manage", expenses: "view" }), [
    { section: "orders", from: "view", to: "manage" },
    { section: "expenses", from: undefined, to: "view" },
  ]);
});

/** The two roles as the migration makes them. */
function seeded(): Record<"Receptionist" | "Supervisor", AccessMap> {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20270106100000_staff_access.sql"), "utf8");
  const out: Record<string, AccessMap> = {};
  for (const m of sql.matchAll(/\('(Receptionist|Supervisor)', '\w+', '(\{[^']*\})'::jsonb\)/g)) out[m[1]] = cleanMap(JSON.parse(m[2]));
  assert.deepEqual(Object.keys(out).sort(), ["Receptionist", "Supervisor"]);
  return out as Record<"Receptionist" | "Supervisor", AccessMap>;
}

// What each role could do before (packages/lib/types.ts and the policies of
// 2026-11-12, main 9be5db1), so nothing changes for anyone on release.
const BEFORE: Record<"Receptionist" | "Supervisor", Partial<Record<Section, "none" | "view" | "manage">>> = {
  Receptionist: {
    orders: "manage", order_admin: "none", invoices: "manage", wallets: "manage", accounts: "none", expenses: "none", bill_approval: "none", vendor_jobs: "none",
    production: "none", workers: "manage", worker_logins: "none", designers: "view", stations: "view",
    catalog: "view", carousel: "view", discounts: "view", announcements: "manage",
    clients: "manage", agents: "view", studios: "none", alexis: "none",
  },
  Supervisor: {
    orders: "manage", order_admin: "none", invoices: "none", wallets: "none", accounts: "none", expenses: "none", bill_approval: "none", vendor_jobs: "none",
    production: "manage", workers: "manage", worker_logins: "manage", designers: "view", stations: "view",
    catalog: "none", carousel: "none", discounts: "none", announcements: "manage",
    clients: "none", agents: "none", studios: "none", alexis: "none",
  },
};

test("Receptionist and Supervisor start with exactly what they could do before", () => {
  const roles = seeded();
  for (const name of ["Receptionist", "Supervisor"] as const) {
    const access = resolveAccess(false, roles[name], {});
    for (const s of SECTION_KEYS) assert.equal(access[s], BEFORE[name][s], `${name}: ${s}`);
  }
});
