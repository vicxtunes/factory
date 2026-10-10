import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { accessSchema, ACCESS_PRESETS, canUse, presetOf, teamMemberInputSchema, type TeamMember } from "./core";
import { TeamError, type TeamStore } from "./ports";
import { TeamService } from "./service";

const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");

const NOW = new Date("2026-10-09T10:00:00Z");

function memoryStore() {
  const rows: (TeamMember & { tenantId: string; clientId: string | null })[] = [];
  const mine = (s: TenantScope, id: string) => rows.find((r) => r.tenantId === s.tenantId && r.id === id);
  const set = (s: TenantScope, id: string, patch: Partial<(typeof rows)[number]>) => !!(mine(s, id) && Object.assign(mine(s, id)!, patch));
  const store: TeamStore = {
    list: async (s) => rows.filter((r) => r.tenantId === s.tenantId),
    get: async (s, id) => mine(s, id) ?? null,
    create: async (s, input) => {
      rows.push({ ...input, id: `m${rows.length + 1}`, tenantId: s.tenantId, archivedAt: null, joined: false, clientId: null, access: [], invite: null });
      return `m${rows.length}`;
    },
    update: async (s, id, input) => set(s, id, input),
    setArchived: async (s, id, archived) => set(s, id, { archivedAt: archived ? "now" : null }),
    setAccess: async (s, id, access) => set(s, id, { access }),
    setInvite: async (s, id, invite) => set(s, id, { invite }),
    removeAccount: async (s, id) => set(s, id, { clientId: null, joined: false, invite: null }),
    byInvite: async (token) => {
      const r = rows.find((x) => x.invite?.token === token);
      return r ? { tenantId: r.tenantId, member: r } : null;
    },
    join: async (tenantId, memberId, token, clientId) => {
      const r = rows.find((x) => x.tenantId === tenantId && x.id === memberId && x.invite?.token === token && !x.archivedAt);
      if (!r) return false;
      if (rows.some((x) => x.tenantId === tenantId && x.clientId === clientId)) throw new TeamError("This account is already on this business's team.");
      Object.assign(r, { clientId, joined: true, invite: null });
      return true;
    },
    membershipsOf: async (clientId) =>
      rows.filter((r) => r.clientId === clientId && !r.archivedAt).map((r) => ({ tenantId: r.tenantId, memberId: r.id, name: r.tenantId, access: r.access })),
  };
  const owners = new Map([["studio-a", "owner-a"], ["studio-b", "owner-b"]]);
  let tokens = 0;
  let now = NOW;
  const service = new TeamService(
    store,
    { ownerOf: async (t) => owners.get(t) ?? null },
    () => `token-${++tokens}-${"x".repeat(32)}`,
    () => now,
  );
  return { store, rows, service, later: (days: number) => (now = new Date(NOW.getTime() + days * 86_400_000)) };
}

test("team input: phone stored in one form, role optional", () => {
  assert.deepEqual(parseInput(teamMemberInputSchema, { name: " Joel ", phone: "+256 700 111 222", role: "" }), { name: "Joel", phone: "+256700111222", role: null });
  assert.throws(() => parseInput(teamMemberInputSchema, { name: "", phone: "", role: "" }), /Enter their name/);
});

test("active members first, by name; archived aren't offered for work", async () => {
  const { service: team } = memoryStore();
  const zed = await team.create(studioA, { name: "Zed", phone: null, role: "Editor" });
  await team.create(studioA, { name: "Joel", phone: null, role: null });
  await team.create(studioA, { name: "Ann", phone: null, role: null });
  await team.setArchived(studioA, zed, true);
  assert.deepEqual((await team.list(studioA)).map((m) => m.name), ["Ann", "Joel", "Zed"]);
  assert.deepEqual((await team.active(studioA)).map((m) => m.name), ["Ann", "Joel"]);
});

test("one studio can't read, change or archive another's member", async () => {
  const { service: team, rows } = memoryStore();
  const id = await team.create(studioA, { name: "Joel", phone: null, role: null });
  assert.equal(await team.get(studioB, id), null);
  await assert.rejects(team.update(studioB, id, { name: "X", phone: null, role: null }), TeamError);
  await assert.rejects(team.setArchived(studioB, id, true), TeamError);
  await assert.rejects(team.setAccess(studioB, id, ["money"]), TeamError);
  await assert.rejects(team.invite(studioB, id), TeamError);
  await assert.rejects(team.removeAccess(studioB, id), TeamError);
  assert.deepEqual([rows[0].name, rows[0].archivedAt], ["Joel", null]);
});

// --- Signing in: access, invites, joining ---------------------------------------

test("access: the owner reaches everything; a member only the areas given, never the owner's own things", () => {
  assert.equal(canUse({ owner: true }), true);
  assert.equal(canUse({ owner: true }, "money"), true);
  const accounts = { owner: false as const, memberId: "m1", areas: ACCESS_PRESETS.accounts.areas };
  assert.deepEqual([canUse(accounts, "money"), canUse(accounts, "clients"), canUse(accounts, "bookings"), canUse(accounts)], [true, true, false, false]);
  const manager = { owner: false as const, memberId: "m1", areas: ACCESS_PRESETS.manager.areas };
  assert.equal(canUse(manager, "catalog"), true);
  assert.equal(canUse(manager), false, "the team and business settings stay the owner's");
});

test("presets: named back from the areas, in any order; anything else is custom", () => {
  assert.equal(presetOf(["money", "clients"]), "accounts");
  assert.equal(presetOf([]), "tasks");
  assert.equal(presetOf(["catalog", "money", "clients", "projects", "bookings"]), "manager");
  assert.equal(presetOf(["bookings"]), "custom");
  assert.deepEqual(parseInput(accessSchema, ["money", "money", "clients"]), ["money", "clients"]);
  assert.throws(() => parseInput(accessSchema, ["team"]), /Choose from the list/);
});

test("invite and join: the account joins once; the link then stops working", async () => {
  const { service: team, rows } = memoryStore();
  const id = await team.create(studioA, { name: "Joel", phone: null, role: "Editor" });
  await team.setAccess(studioA, id, ["money", "clients"]);
  const token = await team.invite(studioA, id);
  assert.equal(rows[0].invite?.expiresAt, "2026-10-16T10:00:00.000Z", "a week");
  assert.equal((await team.byInvite(token))?.member.name, "Joel");
  assert.deepEqual(await team.join(token, "joel-account"), { tenantId: "studio-a", memberId: id });
  assert.deepEqual(await team.membershipsOf("joel-account"), [{ tenantId: "studio-a", memberId: id, name: "studio-a", access: ["money", "clients"] }]);
  assert.equal(await team.byInvite(token), null, "used");
  await assert.rejects(team.join(token, "amina-account"), /isn't valid any more/);
  await assert.rejects(team.invite(studioA, id), /already joined/);
});

test("joining is refused: by the studio's owner, after a week, for an archived member", async () => {
  const { service: team, later } = memoryStore();
  const id = await team.create(studioA, { name: "Joel", phone: null, role: null });
  const token = await team.invite(studioA, id);
  await assert.rejects(team.join(token, "owner-a"), /your own business/);
  later(8);
  await assert.rejects(team.join(token, "joel-account"), /isn't valid any more/);
  later(0);
  const again = await team.invite(studioA, id);
  await team.setArchived(studioA, id, true);
  await assert.rejects(team.join(again, "joel-account"), /isn't valid any more/);
  await assert.rejects(team.invite(studioA, id), /Restore them/);
});

test("a new invite replaces the old; removing access signs them out; archiving ends it", async () => {
  const { service: team } = memoryStore();
  const id = await team.create(studioA, { name: "Joel", phone: null, role: null });
  const first = await team.invite(studioA, id);
  const second = await team.invite(studioA, id);
  assert.equal(await team.byInvite(first), null);
  await team.join(second, "joel-account");
  await team.removeAccess(studioA, id);
  assert.deepEqual(await team.membershipsOf("joel-account"), []);
  await team.join(await team.invite(studioA, id), "joel-account");
  await team.setArchived(studioA, id, true);
  assert.deepEqual(await team.membershipsOf("joel-account"), [], "archived: no sign-in");
});
