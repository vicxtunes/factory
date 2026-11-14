import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { accessSchema, canUse, cleanAreas, resolveAreas, STARTER_ROLES, teamMemberInputSchema, type AccessRole, type AreaMap, type TeamMember } from "./core";
import { TeamError, type TeamStore } from "./ports";
import { TeamService } from "./service";

const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");

const NOW = new Date("2026-10-09T10:00:00Z");

function memoryStore() {
  const rows: (TeamMember & { tenantId: string; clientId: string | null })[] = [];
  const roles: (AccessRole & { tenantId: string })[] = [];
  const roleOf = (r: (typeof rows)[number]) => roles.find((x) => x.id === r.accessRoleId)?.access ?? null;
  const mine = (s: TenantScope, id: string) => rows.find((r) => r.tenantId === s.tenantId && r.id === id);
  const set = (s: TenantScope, id: string, patch: Partial<(typeof rows)[number]>) => !!(mine(s, id) && Object.assign(mine(s, id)!, patch));
  const store: TeamStore = {
    list: async (s) => rows.filter((r) => r.tenantId === s.tenantId),
    get: async (s, id) => mine(s, id) ?? null,
    create: async (s, input) => {
      rows.push({ ...input, id: `m${rows.length + 1}`, tenantId: s.tenantId, archivedAt: null, joined: false, accountId: null, clientId: null, accessRoleId: null, ownAccess: {}, access: resolveAreas(null, {}), invite: null });
      return `m${rows.length}`;
    },
    update: async (s, id, input) => set(s, id, input),
    setArchived: async (s, id, archived) => set(s, id, { archivedAt: archived ? "now" : null }),
    setAccess: async (s, id, roleId, own) => {
      if (!set(s, id, { accessRoleId: roleId, ownAccess: own })) return false;
      const r = mine(s, id)!;
      r.access = resolveAreas(roleOf(r), own);
      return true;
    },
    roles: async (s) => roles.filter((r) => r.tenantId === s.tenantId),
    addRoles: async (s, add) => {
      for (const r of add) {
        if (roles.some((x) => x.tenantId === s.tenantId && x.name.toLowerCase() === r.name.toLowerCase())) throw new TeamError("There's already a role with that name.");
        roles.push({ ...r, id: `r${roles.length + 1}`, tenantId: s.tenantId });
      }
    },
    updateRole: async (s, id, role) => {
      const r = roles.find((x) => x.tenantId === s.tenantId && x.id === id);
      if (!r) return false;
      Object.assign(r, role);
      for (const m of rows.filter((x) => x.accessRoleId === id)) m.access = resolveAreas(r.access, m.ownAccess);
      return true;
    },
    deleteRole: async (s, id) => {
      if (rows.some((m) => m.accessRoleId === id)) throw new TeamError("Someone on the team has this role. Give them another role first.");
      const i = roles.findIndex((x) => x.tenantId === s.tenantId && x.id === id);
      if (i < 0) return false;
      roles.splice(i, 1);
      return true;
    },
    setInvite: async (s, id, invite) => set(s, id, { invite }),
    removeAccount: async (s, id) => set(s, id, { clientId: null, accountId: null, joined: false, invite: null }),
    byInvite: async (token) => {
      const r = rows.find((x) => x.invite?.token === token);
      return r ? { tenantId: r.tenantId, member: r } : null;
    },
    join: async (tenantId, memberId, token, clientId) => {
      const r = rows.find((x) => x.tenantId === tenantId && x.id === memberId && x.invite?.token === token && !x.archivedAt);
      if (!r) return false;
      if (rows.some((x) => x.tenantId === tenantId && x.clientId === clientId)) throw new TeamError("This account is already on this business's team.");
      Object.assign(r, { clientId, accountId: clientId, joined: true, invite: null });
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
  await assert.rejects(team.setAccess(studioB, id, null, { money: "manage" }), TeamError);
  await assert.rejects(team.invite(studioB, id), TeamError);
  await assert.rejects(team.removeAccess(studioB, id), TeamError);
  assert.deepEqual([rows[0].name, rows[0].archivedAt], ["Joel", null]);
});

// --- Signing in: access, invites, joining ---------------------------------------

const member = (areas: AreaMap) => ({ owner: false as const, memberId: "m1", areas: resolveAreas(null, areas) });

test("access: the owner reaches everything; a member only the areas given, at their level, never the owner's own things", () => {
  assert.equal(canUse({ owner: true }), true);
  assert.equal(canUse({ owner: true }, "money", "manage"), true);
  const accounts = member({ money: "manage", clients: "view" });
  assert.deepEqual([canUse(accounts, "money", "manage"), canUse(accounts, "clients"), canUse(accounts, "clients", "manage"), canUse(accounts, "bookings"), canUse(accounts)], [true, true, false, false, false]);
  const manager = member(STARTER_ROLES[0].access);
  assert.equal(canUse(manager, "catalog", "manage"), true);
  assert.equal(canUse(manager), false, "the team and business settings stay the owner's");
});

test("a member's areas: their role's, then their own on top; stored maps are cleaned", () => {
  assert.deepEqual(resolveAreas({ money: "manage", clients: "manage" }, { clients: "view", bookings: "view" }), {
    bookings: "view", projects: "none", clients: "view", money: "manage", catalog: "none", files: "none",
  });
  assert.deepEqual(cleanAreas({ money: "manage", team: "manage", files: "owner" }), { money: "manage" });
  assert.deepEqual(parseInput(accessSchema, { roleId: null, own: { money: "view" } }), { roleId: null, own: { money: "view" } });
  assert.throws(() => parseInput(accessSchema, { roleId: null, own: { team: "manage" } }));
  assert.throws(() => parseInput(accessSchema, { roleId: null, own: { money: "owner" } }));
});

test("roles: a business starts with Manager, Accounts and Tasks only; a change reaches who has it; one in use can't go", async () => {
  const { service: team } = memoryStore();
  assert.deepEqual((await team.roles(studioA)).map((r) => r.name), ["Manager", "Accounts", "Tasks only"]);
  assert.deepEqual((await team.roles(studioA)).length, 3, "made once");
  const accounts = (await team.roles(studioA))[1];
  const id = await team.create(studioA, { name: "Joel", phone: null, role: null });
  await team.setAccess(studioA, id, accounts.id, { bookings: "view" });
  let joel = (await team.get(studioA, id))!;
  assert.deepEqual([joel.access.money, joel.access.clients, joel.access.bookings, joel.access.projects], ["manage", "manage", "view", "none"]);
  await team.updateRole(studioA, accounts.id, { name: "Accounts", access: { money: "view" } });
  joel = (await team.get(studioA, id))!;
  assert.deepEqual([joel.access.money, joel.access.clients, joel.access.bookings], ["view", "none", "view"]);
  await assert.rejects(team.deleteRole(studioA, accounts.id), /another role first/);
  await assert.rejects(team.addRole(studioA, { name: "accounts", access: {} }), /already a role/);
  await assert.rejects(team.setAccess(studioA, id, (await team.roles(studioB))[0].id, {}), /no longer exists/, "another business's role");
  await team.addRole(studioA, { name: "Editor", access: { projects: "manage" } });
  assert.equal((await team.roles(studioA)).length, 4);
});

test("invite and join: the account joins once; the link then stops working", async () => {
  const { service: team, rows } = memoryStore();
  const id = await team.create(studioA, { name: "Joel", phone: null, role: "Editor" });
  await team.setAccess(studioA, id, null, { money: "manage", clients: "manage" });
  const token = await team.invite(studioA, id);
  assert.equal(rows[0].invite?.expiresAt, "2026-10-16T10:00:00.000Z", "a week");
  assert.equal((await team.byInvite(token))?.member.name, "Joel");
  assert.deepEqual(await team.join(token, "joel-account"), { tenantId: "studio-a", memberId: id });
  assert.deepEqual(await team.membershipsOf("joel-account"), [{ tenantId: "studio-a", memberId: id, name: "studio-a", access: resolveAreas(null, { money: "manage", clients: "manage" }) }]);
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
