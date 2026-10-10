import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { SignInRecord } from "./core";
import { PortalError, type PortalSecrets, type PortalStore } from "./ports";
import { StudioPortalService } from "./service";

// The service against an in-memory store that keeps studios apart, and fake
// secrets: tokens are counters, digests are readable.

const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");

function fakes(start = new Date("2026-10-03T10:00:00Z")) {
  let now = start;
  let n = 0;
  type Row = SignInRecord & { tenantId: string; inviteDigest: string | null; inviteExpiresAt: string | null; signedInAt: string | null };
  const rows: Row[] = [
    { tenantId: "studio-a", customerId: "grace", name: "Grace", phone: "0772123456", accessAt: null, inviteDigest: null, inviteExpiresAt: null, signedInAt: null },
    { tenantId: "studio-a", customerId: "nophone", name: "No Phone", phone: null, accessAt: null, inviteDigest: null, inviteExpiresAt: null, signedInAt: null },
    { tenantId: "studio-b", customerId: "grace-at-b", name: "Grace", phone: "0772123456", accessAt: null, inviteDigest: null, inviteExpiresAt: null, signedInAt: null },
  ];
  const slugs = [{ slug: "amina-studio", tenantId: "studio-a", current: true }, { slug: "amina-photos", tenantId: "studio-a", current: false }];
  const find = (t: string, id: string) => rows.find((r) => r.tenantId === t && r.customerId === id);
  const store: PortalStore = {
    studioBySlug: async (slug) => {
      const s = slugs.find((x) => x.slug === slug);
      return s ? { tenantId: s.tenantId, currentSlug: slugs.find((x) => x.tenantId === s.tenantId && x.current)!.slug } : null;
    },
    currentSlug: async (t) => slugs.find((x) => x.tenantId === t && x.current)?.slug ?? null,
    setSlug: async (t, slug) => {
      const owner = slugs.find((x) => x.slug === slug);
      if (owner && owner.tenantId !== t) throw new PortalError("That address is taken. Try another.");
      for (const x of slugs) if (x.tenantId === t) x.current = x.slug === slug;
      if (!owner) slugs.push({ slug, tenantId: t, current: true });
    },
    customerByPhone: async (t, phone) => rows.find((r) => r.tenantId === t && r.phone === phone) ?? null,
    customer: async (t, id) => find(t, id) ?? null,
    customerByInvite: async (d) => {
      const r = rows.find((x) => x.inviteDigest === d);
      return r ? { tenantId: r.tenantId, customerId: r.customerId, expiresAt: r.inviteExpiresAt! } : null;
    },
    setInvite: async (t, id, d, e) => !!(find(t, id) && Object.assign(find(t, id)!, { inviteDigest: d, inviteExpiresAt: e })),
    setAccess: async (t, id, at) => void Object.assign(find(t, id)!, { accessAt: at, inviteDigest: null, inviteExpiresAt: null }),
    recordSignIn: async (t, id, at) => void Object.assign(find(t, id)!, { signedInAt: at }),
    status: async (s, id) => {
      const r = find(s.tenantId, id);
      return r ? { hasPhone: !!r.phone, hasAccess: !!r.accessAt, inviteExpiresAt: r.inviteExpiresAt, signedInAt: r.signedInAt } : null;
    },
  };
  const secrets: PortalSecrets = {
    newToken: () => `token-${++n}`,
    digest: (t) => `digest(${t})`,
  };
  const service = new StudioPortalService(store, secrets, () => now);
  return { service, rows, slugs, advance: (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000)) };
}

test("a slug resolves; an old one redirects to the current one", async () => {
  const { service } = fakes();
  assert.deepEqual(await service.resolve("amina-studio"), { tenantId: "studio-a", redirectTo: null });
  assert.deepEqual(await service.resolve("amina-photos"), { tenantId: "studio-a", redirectTo: "amina-studio" });
  assert.equal(await service.resolve("nobody"), null);
});

test("changing the slug keeps the old one; another studio can't take it", async () => {
  const { service } = fakes();
  await service.setSlug(studioA, "grace-and-co");
  assert.deepEqual(await service.resolve("amina-studio"), { tenantId: "studio-a", redirectTo: "grace-and-co" });
  await assert.rejects(service.setSlug(studioB, "amina-studio"), /taken/);
  await service.setSlug(studioA, "amina-studio");
  assert.deepEqual(await service.resolve("grace-and-co"), { tenantId: "studio-a", redirectTo: "amina-studio" });
});

test("the studio's link opens the client's page on this device; the link then stops working", async () => {
  const { service, rows } = fakes();
  const token = await service.invite(studioA, "grace");
  assert.equal(rows[0].inviteDigest, `digest(${token})`, "only the digest is stored");
  assert.deepEqual(await service.inviteFor("studio-a", token), { name: "Grace" });
  assert.equal((await service.status(studioA, "grace"))?.invitePending, true);
  const session = await service.openLink("studio-a", token);
  assert.equal(session.customerId, "grace");
  assert.ok(session.accessAt);
  assert.ok(await service.check(session));
  assert.equal((await service.status(studioA, "grace"))?.invitePending, false);
  await assert.rejects(service.openLink("studio-a", token), /expired or was already used/);
});

test("links expire, belong to one studio, and need a phone", async () => {
  const { service, advance } = fakes();
  const token = await service.invite(studioA, "grace");
  await assert.rejects(service.openLink("studio-b", token), /expired or was already used/, "another studio's address");
  advance(7 * 24 * 60 + 1);
  assert.equal(await service.inviteFor("studio-a", token), null);
  await assert.rejects(service.openLink("studio-a", token), /expired/);
  await assert.rejects(service.invite(studioA, "nophone"), /phone number first/);
  await assert.rejects(service.invite(studioB, "grace"), /no longer exists/);
});

test("every signed-in device stays signed in together; a session is good at its own studio only", async () => {
  const { service, advance } = fakes();
  const booked = await service.openDevice("studio-a", "grace");
  advance(60);
  const phone = await service.openLink("studio-a", await service.invite(studioA, "grace"));
  assert.equal(phone.accessAt, booked.accessAt, "the second device carries the same access time");
  assert.ok(await service.check(booked));
  assert.ok(await service.check(phone));
  assert.equal(await service.check({ ...booked, tenantId: "studio-b" }), null);
  assert.equal(await service.check({ ...booked, customerId: "grace-at-b" }), null);
  assert.equal(await service.check({ tenantId: "studio-a", customerId: "grace", accessAt: "2020-01-01T00:00:00.000Z" }), null, "an old access time");
  await assert.rejects(service.openDevice("studio-b", "grace"), /no longer exists/);
});

test("just the phone: a number the studio has signs this device in; one it doesn't is refused", async () => {
  const { service, advance } = fakes();
  const booked = await service.openDevice("studio-a", "grace");
  advance(60);
  const byPhone = await service.signIn("studio-a", "0772123456");
  assert.equal(byPhone.customerId, "grace");
  assert.equal(byPhone.accessAt, booked.accessAt, "signs in alongside the client's other devices");
  assert.ok(await service.check(byPhone));
  await assert.rejects(service.signIn("studio-a", "0700000000"), /don't have this number/);
  assert.equal((await service.signIn("studio-b", "0772123456")).customerId, "grace-at-b", "each studio its own client");
});
