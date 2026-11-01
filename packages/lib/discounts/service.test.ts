import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Discount, DiscountInput } from "./core";
import { DiscountError, type DiscountStore } from "./ports";
import { DiscountService } from "./service";

// The service against an in-memory DiscountStore: no database needed.

const NOW = new Date("2026-10-15T09:00:00Z");
const scope: TenantScope = { tenantId: "t1", currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" };
const actor = { id: "u1", name: "Boss" };

function memoryStore(seed: Discount[] = []) {
  const rows = new Map(seed.map((d) => [d.id, { ...d }]));
  const store: DiscountStore = {
    list: async () => [...rows.values()],
    get: async (_s, id) => rows.get(id) ?? null,
    create: async (_s, input, by) => {
      const id = `d${rows.size + 1}`;
      rows.set(id, { id, ...input, startsAt: input.startsAt ?? NOW.toISOString(), uses: 0, createdByName: by.name, createdAt: NOW.toISOString() });
      return id;
    },
    end: async (_s, id, at) => void (rows.get(id)!.endsAt = at),
    remove: async (_s, id) => void rows.delete(id),
    findByCode: async (_s, code) => [...rows.values()].find((d) => d.code === code) ?? null,
    applyCode: async () => {},
  };
  return { store, rows };
}

const discount = (id: string, startsAt: string, endsAt: string | null = null): Discount => ({
  id, name: id, kind: "percent", value: 10, appliesTo: "all", productIds: [], startsAt, endsAt, code: null, maxUses: null, uses: 0, createdByName: "Boss", createdAt: startsAt,
});

const input: DiscountInput = { name: "  October sale ", kind: "percent", value: 10, appliesTo: "all", productIds: [], startsAt: null, endsAt: null, code: null, maxUses: null };

test("list puts running first, then scheduled, then ended", async () => {
  const { store } = memoryStore([
    discount("ended", "2026-09-01T00:00:00Z", "2026-09-30T00:00:00Z"),
    discount("scheduled", "2026-11-01T00:00:00Z"),
    discount("running", "2026-10-01T00:00:00Z"),
  ]);
  const list = await new DiscountService(store, () => NOW).list(scope);
  assert.deepEqual(list.map((d) => [d.id, d.status]), [["running", "running"], ["scheduled", "scheduled"], ["ended", "ended"]]);
});

test("create trims the name and stores it", async () => {
  const { store, rows } = memoryStore();
  const id = await new DiscountService(store, () => NOW).create(scope, input, actor);
  assert.equal(rows.get(id)?.name, "October sale");
});

test("create refuses what the rules refuse, with their message", async () => {
  const { store, rows } = memoryStore();
  await assert.rejects(
    new DiscountService(store, () => NOW).create(scope, { ...input, appliesTo: "products" }, actor),
    (err) => err instanceof DiscountError && err.message === "Choose at least one product.",
  );
  assert.equal(rows.size, 0);
});

test("stop ends a running discount now and removes a scheduled one", async () => {
  const { store, rows } = memoryStore([discount("running", "2026-10-01T00:00:00Z"), discount("scheduled", "2026-11-01T00:00:00Z")]);
  const service = new DiscountService(store, () => NOW);
  assert.equal(await service.stop(scope, "running", actor), "ended");
  assert.equal(rows.get("running")?.endsAt, NOW.toISOString());
  assert.equal(await service.stop(scope, "scheduled", actor), "removed");
  assert.equal(rows.has("scheduled"), false);
});

test("stop refuses a missing or already-ended discount", async () => {
  const { store } = memoryStore([discount("ended", "2026-09-01T00:00:00Z", "2026-09-30T00:00:00Z")]);
  const service = new DiscountService(store, () => NOW);
  await assert.rejects(service.stop(scope, "nope", actor), /no longer exists/);
  await assert.rejects(service.stop(scope, "ended", actor), /already ended/);
});

test("create stores a typed code as BLACKNOV", async () => {
  const { store, rows } = memoryStore();
  const id = await new DiscountService(store, () => NOW).create(scope, { ...input, code: " blacknov " }, actor);
  assert.equal(rows.get(id)?.code, "BLACKNOV");
});

test("a promo code works only while running and not used up, typed in any case", async () => {
  const withCode = (id: string, code: string, startsAt: string, endsAt: string | null, uses = 0, maxUses: number | null = null) => ({
    ...discount(id, startsAt, endsAt), code, uses, maxUses,
  });
  const { store } = memoryStore([
    withCode("on", "BLACKNOV", "2026-10-01T00:00:00Z", null),
    withCode("soon", "DEC", "2026-12-01T00:00:00Z", null),
    withCode("over", "SEPT", "2026-09-01T00:00:00Z", "2026-09-30T00:00:00Z"),
    withCode("full", "FIRST10", "2026-10-01T00:00:00Z", null, 10, 10),
  ]);
  const service = new DiscountService(store, () => NOW);
  assert.deepEqual(await service.promoCode(scope, " blacknov "), {
    discountId: "on", code: "BLACKNOV", kind: "percent", value: 10, appliesTo: "all", productIds: [],
  });
  await assert.rejects(service.promoCode(scope, "DEC"), /isn't on yet/);
  await assert.rejects(service.promoCode(scope, "sept"), /has ended/);
  await assert.rejects(service.promoCode(scope, "FIRST10"), /used up/);
  await assert.rejects(service.promoCode(scope, "NOPE"), /isn't a promo code we know/);
});
