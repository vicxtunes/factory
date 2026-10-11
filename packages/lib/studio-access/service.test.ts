import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import {
  detailsSchema,
  maskEmail,
  reviewEmail,
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
    logoKey: null, ownerEmail: null, ownerEmailVerifiedAt: null, slug: null,
    submittedAt: null, reviewedAt: null, reviewNote: null, createdAt: "2026-10-01T00:00:00Z",
  };
}

function setup() {
  const studios = new Map<string, StudioAccess>([[A, blank(A, "Amina Studio")], [B, blank(B, "Bright Studio")]]);
  const codes = new Map<string, EmailCode>();
  const sent: { to: string; subject: string; text: string; html: string }[] = [];
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
    emailInUse: async (_id, email) => email === "taken@mail.com",
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
    { workspace: "https://client.test/studio", logo: "https://client.test/icon-192.png" },
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
}

test("details: owner names and a phone are required; the phone is stored in one form", () => {
  assert.equal(details.phone, "+256703360688");
  assert.throws(() => parseInput(detailsSchema, { ...details, ownerLastName: " " }), /owner's last name/);
  assert.throws(() => parseInput(detailsSchema, { ...details, ownerFirstName: "Am1na" }), /letters only/);
  assert.throws(() => parseInput(detailsSchema, { ...details, phone: "" }), /phone number/);
});

test("onboarding: every step before submitting; then it waits for review and can't be changed", async () => {
  const t = setup();
  await assert.rejects(t.service.submit(A), /add your business's details, your business's address, a verified email/);
  await onboard(t);
  await t.service.submit(A);
  assert.equal(t.one(A).status, "in_review");
  assert.ok(t.one(A).submittedAt);
  await assert.rejects(t.service.saveDetails(A, details), /being reviewed/);
  await assert.rejects(t.service.submit(A), /being reviewed/);
  assert.equal(t.one(B).status, "onboarding", "only that studio");
});

test("email codes: 6 digits by email, 10 minutes, 5 tries, one at a time, stored hashed", async () => {
  const t = setup();
  const first = await t.service.sendVerifyCode(A, "amina@mail.com");
  assert.deepEqual(first, { sentTo: "amina@mail.com", resendIn: 600, alreadySent: false });
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent.at(-1)!.to, "amina@mail.com");
  assert.match(t.sent.at(-1)!.text, /123456/);
  assert.ok(!JSON.stringify([...t.codes.values()]).includes('"123456"'), "only a hash is kept");

  // One code at a time: asking again sends nothing and points to the pending one.
  t.tick(4 * 60_000);
  const again = await t.service.sendVerifyCode(A, "other@mail.com");
  assert.deepEqual(again, { sentTo: maskEmail("amina@mail.com"), resendIn: 360, alreadySent: true });
  assert.equal(t.sent.length, 1, "no second email");

  await assert.rejects(t.service.verifyEmail(B, "123456"), /Ask for a code first/, "a code is for its own studio");
  for (let i = 0; i < 4; i++) await assert.rejects(t.service.verifyEmail(A, "000000"), /code is wrong/);
  await assert.rejects(t.service.verifyEmail(A, "000000"), /Too many wrong codes/);
  await assert.rejects(t.service.verifyEmail(A, "123456"), /Ask for a code first/, "5 wrong tries use it up");

  // Used up: a new one can be sent straight away.
  t.setNextCode("654321");
  assert.equal((await t.service.sendVerifyCode(A, "amina@mail.com")).alreadySent, false);
  assert.equal(t.sent.length, 2);
  t.tick(10 * 60_000);
  await assert.rejects(t.service.verifyEmail(A, "654321"), /expired/);

  // An email another account signs in with is refused before any code goes out.
  await assert.rejects(t.service.sendVerifyCode(A, "taken@mail.com"), /belongs to another account/);
  assert.equal(t.sent.length, 2);

  // Expired: a new one too.
  await t.service.sendVerifyCode(A, "new@mail.com");
  assert.equal(t.sent.length, 3);
  await t.service.verifyEmail(A, "654321");
  assert.equal(t.one(A).ownerEmail, "new@mail.com");
  await assert.rejects(t.service.verifyEmail(A, "654321"), /Ask for a code first/, "a code works once");
  assert.equal((await t.service.sendVerifyCode(A, "new@mail.com")).alreadySent, false, "used: a new one can be sent");
});

test("review: approve, send back with a reason, suspend; the owner is told", async () => {
  const t = setup();
  await onboard(t);
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
  assert.match(t.sent.at(-1)!.html, /Open your business/);
  await assert.rejects(t.service.review(A, "approve", ""), /already open/);

  await assert.rejects(t.service.review(A, "suspend", " "), /Tell the business why/);
  await t.service.review(A, "suspend", "Unpaid balance with Aming.");
  assert.equal(t.one(A).status, "suspended" satisfies StudioStatus);
  await assert.rejects(t.service.review(A, "suspend", "again"), /already suspended/);
  await t.service.review(A, "approve", "");
  assert.equal(t.one(A).status, "active", "approving lifts a suspension");

  assert.throws(() => parseInput(reviewSchema, { studioId: A, decision: "send_back", note: "" }), /Tell the business why/);
});

test("approve now: the boss can open a set-up studio before it's submitted, never one that isn't set up", async () => {
  const t = setup();
  await assert.rejects(t.service.review(A, "approve", ""), /can't open until it's set up\. Still missing: their business's details/);
  assert.equal(t.one(A).status, "onboarding");
  await onboard(t);
  await t.service.review(A, "approve", "");
  assert.equal(t.one(A).status, "active", "no submit needed");
  assert.match(t.sent.at(-1)!.subject, /is approved/);
});

test("reinstating a studio suspended before it was set up sends it back to setting up, not open", async () => {
  const t = setup();
  await t.service.review(A, "suspend", "Looks like a duplicate account.");
  await t.service.review(A, "approve", "");
  assert.equal(t.one(A).status, "onboarding");
  assert.deepEqual(t.pushed.at(-1), { clientId: "client-Amina Studio", title: "Amina Studio can continue setting up" });
  assert.equal(t.sent.length, 0, "no verified email yet, so only the notification");
  const email = reviewEmail({ workspace: "https://www.amingspace.com/studio", logo: null }, "Amina Studio", "resume", null);
  assert.equal(email.subject, "Amina Studio can continue setting up");
  assert.match(email.text, /lifted the suspension[\s\S]*Continue setting up: https:\/\/www\.amingspace\.com\/studio/);
  // Once set up, the same button opens it.
  await onboard(t);
  await t.service.review(A, "suspend", "Unpaid balance.");
  await t.service.review(A, "approve", "");
  assert.equal(t.one(A).status, "active");
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

test("emails: Aming Space branding, a plain-text copy, and names can't inject HTML", async () => {
  const t = setup();
  t.one(A).name = "<b>Amina</b> & Co";
  await t.service.sendVerifyCode(A, "amina@mail.com");
  const email = t.sent.at(-1)!;
  assert.equal(email.subject, "123456 is your <b>Amina</b> & Co code", "subjects are plain text");
  assert.match(email.text, /123456/);
  assert.match(email.text, /Aming Space/);
  assert.match(email.html, /Aming <span[^>]*>Space<\/span>/);
  assert.match(email.html, /icon-192\.png/);
  assert.ok(email.html.includes("&lt;b&gt;Amina&lt;/b&gt; &amp; Co") && !email.html.includes("<b>Amina</b>"));
  assert.match(email.html, /Replies to it aren't read|Replies to it aren&#39;t read/);
});

test("emails never carry a dead link: a bare path (the app's address not set) is left out", async () => {
  const { reviewEmail } = await import("./core");
  const bare = { workspace: "/studio", logo: null };
  for (const email of [reviewEmail(bare, "Amina Studio", "send_back", "Change the logo")]) {
    assert.ok(!email.text.includes("/studio") && !email.html.includes('href="/studio"'), email.subject);
  }
  const full = reviewEmail({ workspace: "https://www.amingspace.com/studio", logo: null }, "Amina Studio", "send_back", "Change the logo");
  assert.match(full.text, /Make the changes: https:\/\/www\.amingspace\.com\/studio/);
  assert.match(full.html, /href="https:\/\/www\.amingspace\.com\/studio"/);
});
