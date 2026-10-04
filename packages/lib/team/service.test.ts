import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { teamMemberInputSchema, type TeamMember } from "./core";
import { TeamError, type TeamStore } from "./ports";
import { TeamService } from "./service";

const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");

function memoryStore() {
  const rows: (TeamMember & { tenantId: string })[] = [];
  const mine = (s: TenantScope, id: string) => rows.find((r) => r.tenantId === s.tenantId && r.id === id);
  const store: TeamStore = {
    list: async (s) => rows.filter((r) => r.tenantId === s.tenantId),
    get: async (s, id) => mine(s, id) ?? null,
    create: async (s, input) => {
      rows.push({ ...input, id: `m${rows.length + 1}`, tenantId: s.tenantId, archivedAt: null });
      return `m${rows.length}`;
    },
    update: async (s, id, input) => !!(mine(s, id) && Object.assign(mine(s, id)!, input)),
    setArchived: async (s, id, archived) => !!(mine(s, id) && Object.assign(mine(s, id)!, { archivedAt: archived ? "now" : null })),
  };
  return { store, rows };
}

test("team input: phone stored in one form, role optional", () => {
  assert.deepEqual(parseInput(teamMemberInputSchema, { name: " Joel ", phone: "+256 700 111 222", role: "" }), { name: "Joel", phone: "+256700111222", role: null });
  assert.throws(() => parseInput(teamMemberInputSchema, { name: "", phone: "", role: "" }), /Enter their name/);
});

test("active members first, by name; archived aren't offered for work", async () => {
  const { store } = memoryStore();
  const team = new TeamService(store);
  const zed = await team.create(studioA, { name: "Zed", phone: null, role: "Editor" });
  await team.create(studioA, { name: "Joel", phone: null, role: null });
  await team.create(studioA, { name: "Ann", phone: null, role: null });
  await team.setArchived(studioA, zed, true);
  assert.deepEqual((await team.list(studioA)).map((m) => m.name), ["Ann", "Joel", "Zed"]);
  assert.deepEqual((await team.active(studioA)).map((m) => m.name), ["Ann", "Joel"]);
});

test("one studio can't read, change or archive another's member", async () => {
  const { store, rows } = memoryStore();
  const team = new TeamService(store);
  const id = await team.create(studioA, { name: "Joel", phone: null, role: null });
  assert.equal(await team.get(studioB, id), null);
  await assert.rejects(team.update(studioB, id, { name: "X", phone: null, role: null }), TeamError);
  await assert.rejects(team.setArchived(studioB, id, true), TeamError);
  assert.deepEqual([rows[0].name, rows[0].archivedAt], ["Joel", null]);
});
