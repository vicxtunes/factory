import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import {
  detailsSchema,
  isUnlocked,
  maskEmail,
  newPasswordSchema,
  passwordProblem,
  reviewSchema,
  type EmailCode,
  type StudioAccess,
  type StudioStatus,
} from "./core";
import type { AccessSecrets, AccessStore, LogoFiles } from "./ports";
import { StudioAccessService } from "./service";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

function blank(tenantId: string, name: string): StudioAccess {
  return {
    tenantId, ownerClientId: `client-${name}`, client: { name: "Amina N.", phone: null }, status: "onboarding", name, phone: null, ownerFirstName: null, ownerLastName: null,
    logoKey: null, ownerEmail: null, ownerEmailVerifiedAt: null, slug: null, passwordHash: null, passwordSetAt: null,
    passwordFailedAttempts: 0, passwordLockedUntil: null, submittedAt: null, reviewedAt: null, reviewNote: null, createdAt: "2026-10-01T00:00:00Z",
  };
}

function setup() {
  const studios = new Map<string, StudioAccess>([[A, blank(A, "Amina Studio")], [B, blank(B, "Bright Studio")]]);
  const codes = new Map<string, EmailCode>();
  const sent: { to: string; subject: string; text: string }[] = [];
  const pushed: { clientId: string; title: string }[] = [];
  const objects = new Map<string, number>();
  let clock = new Date("2026-10-04T10:00:00Z");
  let ids = 0;
  const one = (id: string) => studios.get(id)!;

  const store: AccessStore = {
    get: async (id) => (studios.has(id) ? { ...one(id) } : null),
    saveDetails: async (id, d) => void Object.assign(one(id), { name: d.name, phone: d.phone, ownerFirstName: d.ownerFirstName, ownerLastName: d.ownerLastName }),
    setLogo: async (id, key) => {
      const old = one(id).logoKey;
      one(id).logoKey = key;
      return old;
    },
    setOwnerEmail: async (id, email, at) => void Object.assign(one(id), { ownerEmail: email, ownerEmailVerifiedAt: at }),
    setPassword: async (id, hash, at) => void Object.assign(one(id), { passwordHash: hash, passwordSetAt: at, passwordFailedAttempts: 0, passwordLockedUntil: null }),
    recordWrongPassword: async (id, n, until) => void Object.assign(one(id), { passwordFailedAttempts: n, passwordLockedUntil: until }),
    clearWrongPasswords: async (id) => void Object.assign(one(id), { passwordFailedAttempts: 0, passwordLockedUntil: null }),
    setStatus: async (id, from, to, at, note) => {
      const s = one(id);
      if (s.status !== from) return false;
      Object.assign(s, { status: to, reviewNote: note }, to === "in_review" ? { submittedAt: at } : { reviewedAt: at });
      return true;
    },
    forReview: async () => [],
    reviewOne: async () => null,
    code: async (id, purpose) => codes.get(`${id}:${purpose}`) ?? null,
    saveCode: async (c) => void codes.set(`${c.tenantId}:${c.purpose}`, { ...c }),
    setCodeAttempts: async (id, purpose, n) => void (codes.get(`${id}:${purpose}`)!.attempts = n),
    deleteCode: async (id, purpose) => void codes.delete(`${id}:${purpose}`),
  };
  let nextCode = "123456";
  const secrets: AccessSecrets = {
    newCode: () => nextCode,
    hashCode: (id, purpose, code) => `h:${id}:${purpose}:${code}`,
    sameHash: (a, b) => a === b,
    hashPassword: async (p) => `pw:${p}`,
    verifyPassword: async (p, h) => h === `pw:${p}`,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`,
  };
  const files: LogoFiles = {
    putUrl: async (key) => `https://r2.test/${key}?put`,
    getUrl: async (key) => `https://r2.test/${key}?get`,
    size: async (key) => objects.get(key) ?? null,
    move: async (from, to) => {
      objects.set(to, objects.get(from)!);
      objects.delete(from);
    },
    remove: async (keys) => keys.forEach((k) => objects.delete(k)),
  };
  const service = new StudioAccessService(
    store,
    { send: async (e) => void sent.push(e) },
    secrets,
    files,
    { notify: async (clientId, m) => void pushed.push({ clientId, title: m.title }) },
    { workspace: "https://client.test/studio" },
    () => clock,
  );
  return {
    service, studios, codes, sent, pushed, objects, one,
    tick: (ms: number) => (clock = new Date(clock.getTime() + ms)),
    now: () => clock,
    setNextCode: (c: string) => (nextCode = c),
  };
}

const details = parseInput(detailsSchema, { name: "Amina Studio", ownerFirstName: "Amina", ownerLastName: "Nakato", phone: "0703 360 688" });

async function onboard(t: ReturnType<typeof setup>, id = A) {
  await t.service.saveDetails(id, details);
  t.one(id).slug = "amina-studio";
  await t.service.sendVerifyCode(id, "amina@mail.com");
  await t.service.verifyEmail(id, "123456");
  return t.service.setPassword(id, "Golden-hour-77");
}

test("details: owner names and a phone are required; the phone is stored in one form", () => {
  assert.equal(details.phone, "+256703360688");
  assert.throws(() => parseInput(detailsSchema, { ...details, ownerLastName: " " }), /owner's last name/);
  assert.throws(() => parseInput(detailsSchema, { ...details, ownerFirstName: "Am1na" }), /letters only/);
  assert.throws(() => parseInput(detailsSchema, { ...details, phone: "" }), /phone number/);
});

test("passwords: 8+ characters, typed twice, not common, not the studio's name", () => {
  assert.equal(parseInput(newPasswordSchema, { password: "Golden-hour-77", confirm: "Golden-hour-77" }), "Golden-hour-77");
  assert.throws(() => parseInput(newPasswordSchema, { password: "short", confirm: "short" }), /at least 8/);
  assert.throws(() => parseInput(newPasswordSchema, { password: "Golden-hour-77", confirm: "Golden-hour-78" }), /don't match/);
  assert.match(passwordProblem("Password123")!, /too common/);
  assert.match(passwordProblem("aaaaaaaa")!, /over and over/);
  assert.match(passwordProblem("70336068812")!, /letters/);
  assert.match(passwordProblem("Amina Studio!", ["Amina Studio"])!, /studio's name/);
  assert.equal(passwordProblem("Golden-hour-77", ["Amina Studio"]), null);
});

test("onboarding: every step before submitting; then it waits for review and can't be changed", async () => {
  const t = setup();
  await assert.rejects(t.service.submit(A), /add your studio's details, your studio's address, a verified email, a password/);
  await onboard(t);
  await t.service.submit(A);
  assert.equal(t.one(A).status, "in_review");
  assert.ok(t.one(A).submittedAt);
  await assert.rejects(t.service.saveDetails(A, details), /being reviewed/);
  await assert.rejects(t.service.submit(A), /being reviewed/);
  assert.equal(t.one(B).status, "onboarding", "only that studio");
});

test("email codes: 6 digits by email, 10 minutes, 5 tries, 60 seconds between sends, stored hashed", async () => {
  const t = setup();
  await t.service.sendVerifyCode(A, "amina@mail.com");
  assert.equal(t.sent.at(-1)!.to, "amina@mail.com");
  assert.match(t.sent.at(-1)!.text, /123456/);
  assert.ok(!JSON.stringify([...t.codes.values()]).includes('"123456"'), "only a hash is kept");
  await assert.rejects(t.service.sendVerifyCode(A, "amina@mail.com"), /Wait 60 seconds/);
  t.tick(30_000);
  await assert.rejects(t.service.sendVerifyCode(A, "amina@mail.com"), /Wait 30 seconds/);

  await assert.rejects(t.service.verifyEmail(B, "123456"), /Ask for a code first/, "a code is for its own studio");
  for (let i = 0; i < 4; i++) await assert.rejects(t.service.verifyEmail(A, "000000"), /code is wrong/);
  await assert.rejects(t.service.verifyEmail(A, "000000"), /Too many wrong codes/);
  await assert.rejects(t.service.verifyEmail(A, "123456"), /Ask for a code first/, "5 wrong tries use it up");

  t.tick(31_000);
  t.setNextCode("654321");
  await t.service.sendVerifyCode(A, "amina@mail.com");
  t.tick(10 * 60_000);
  await assert.rejects(t.service.verifyEmail(A, "654321"), /expired/);

  t.tick(61_000);
  await t.service.sendVerifyCode(A, "new@mail.com");
  await t.service.verifyEmail(A, "654321");
  assert.equal(t.one(A).ownerEmail, "new@mail.com");
  await assert.rejects(t.service.verifyEmail(A, "654321"), /Ask for a code first/, "a code works once");
});

test("the password unlocks a device for 30 days; 5 wrong tries lock it for 15 minutes", async () => {
  const t = setup();
  const first = await onboard(t);
  assert.ok(isUnlocked(first, t.one(A), t.now()));
  assert.ok(!isUnlocked(first, { ...t.one(A), tenantId: B }, t.now()), "not another studio");

  const unlock = await t.service.unlock(A, "Golden-hour-77");
  t.tick(29 * 86_400_000);
  assert.ok(isUnlocked(unlock, t.one(A), t.now()));
  t.tick(2 * 86_400_000);
  assert.ok(!isUnlocked(unlock, t.one(A), t.now()), "asked again after 30 days");

  for (let i = 0; i < 4; i++) await assert.rejects(t.service.unlock(A, "wrong-one"), /password is wrong/);
  await assert.rejects(t.service.unlock(A, "wrong-one"), /locked for 15 minutes/);
  await assert.rejects(t.service.unlock(A, "Golden-hour-77"), /Try again in 15 minutes/, "even the right one while locked");
  t.tick(15 * 60_000);
  await t.service.unlock(A, "Golden-hour-77");
  assert.equal(t.one(A).passwordFailedAttempts, 0);
});

test("forgot password: a code to the verified email; the new password signs other devices out", async () => {
  const t = setup();
  await assert.rejects(t.service.sendResetCode(A), /no verified email/);
  await onboard(t);
  const otherDevice = await t.service.unlock(A, "Golden-hour-77");
  t.tick(61_000);
  t.setNextCode("777777");
  const { sentTo } = await t.service.sendResetCode(A);
  assert.equal(sentTo, maskEmail("amina@mail.com"));
  assert.equal(t.sent.at(-1)!.to, "amina@mail.com");
  await assert.rejects(t.service.resetPassword(A, "777777", "password123"), /too common/);
  t.tick(1000);
  const here = await t.service.resetPassword(A, "777777", "Blue-Studio-2026");
  assert.ok(isUnlocked(here, t.one(A), t.now()));
  assert.ok(!isUnlocked(otherDevice, t.one(A), t.now()), "other devices are signed out");
  assert.match(t.sent.at(-1)!.subject, /password was changed/);
  await t.service.unlock(A, "Blue-Studio-2026");
});

test("review: approve, send back with a reason, suspend; the owner is told", async () => {
  const t = setup();
  await onboard(t);
  await assert.rejects(t.service.review(A, "approve", ""), /isn't waiting/, "not submitted yet");
  await t.service.submit(A);

  await t.service.review(A, "send_back", "Please upload your real logo.");
  assert.equal(t.one(A).status, "changes_requested");
  assert.equal(t.one(A).reviewNote, "Please upload your real logo.");
  assert.deepEqual(t.pushed.at(-1), { clientId: "client-Amina Studio", title: "Amina Studio needs a few changes" });
  assert.match(t.sent.at(-1)!.text, /real logo/);

  await t.service.saveDetails(A, details);
  await t.service.submit(A);
  await t.service.review(A, "approve", "");
  assert.equal(t.one(A).status, "active");
  assert.equal(t.one(A).reviewNote, null);
  assert.match(t.sent.at(-1)!.subject, /is approved/);
  await assert.rejects(t.service.review(A, "approve", ""), /isn't waiting/);

  await assert.rejects(t.service.review(A, "suspend", " "), /Tell the studio why/);
  await t.service.review(A, "suspend", "Unpaid balance with Aming.");
  assert.equal(t.one(A).status, "suspended" satisfies StudioStatus);
  await assert.rejects(t.service.review(A, "suspend", "again"), /already suspended/);
  await t.service.review(A, "approve", "");
  assert.equal(t.one(A).status, "active", "approving lifts a suspension");

  assert.throws(() => parseInput(reviewSchema, { studioId: A, decision: "send_back", note: "" }), /Tell the studio why/);
});

test("logo: uploaded to a signed link, checked, moved; the old one is deleted", async () => {
  const t = setup();
  const first = await t.service.startLogoUpload(A);
  assert.match(first.key, new RegExp(`^incoming/logos/${A}/`));
  await assert.rejects(t.service.confirmLogo(A, first.key), /didn't arrive/);
  t.objects.set(first.key, 40_000);
  await assert.rejects(t.service.confirmLogo(B, first.key), /isn't valid/, "another studio's upload");
  await t.service.confirmLogo(A, first.key);
  const kept = t.one(A).logoKey!;
  assert.match(kept, new RegExp(`^studios/${A}/logo-`));
  assert.ok(t.objects.has(kept) && !t.objects.has(first.key));

  const second = await t.service.startLogoUpload(A);
  t.objects.set(second.key, 2_000_000);
  await assert.rejects(t.service.confirmLogo(A, second.key), /too large/);
  assert.ok(!t.objects.has(second.key));
  const third = await t.service.startLogoUpload(A);
  t.objects.set(third.key, 50_000);
  await t.service.confirmLogo(A, third.key);
  assert.ok(!t.objects.has(kept), "the old logo is deleted");
});
