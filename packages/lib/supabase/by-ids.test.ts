import assert from "node:assert/strict";
import { test } from "node:test";

import { selectByIds } from "./by-ids";

// A fake table of rows keyed by `ref`, answering like PostgREST: at most 1000 rows a request.
function table(rows: { ref: string; n: number }[]) {
  const calls: { ids: string[]; from: number; to: number }[] = [];
  const query = (batch: string[]) => ({
    range(from: number, to: number) {
      calls.push({ ids: batch, from, to });
      const hits = rows.filter((r) => batch.includes(r.ref));
      return Promise.resolve({ data: hits.slice(from, Math.min(to + 1, from + 1000)), error: null });
    },
  });
  return { query, calls };
}

test("a long id list goes 100 ids a request and nothing is lost", async () => {
  const ids = Array.from({ length: 437 }, (_, i) => `id-${i}`);
  const { query, calls } = table(ids.map((ref, n) => ({ ref, n })));
  const { data, error } = await selectByIds(ids, query);
  assert.equal(error, null);
  assert.equal(data.length, 437);
  assert.equal(calls.length, 5);
  assert.ok(calls.every((c) => c.ids.length <= 100));
});

test("more than 1000 rows for one batch are read page by page", async () => {
  const rows = Array.from({ length: 2500 }, (_, n) => ({ ref: `id-${n % 3}`, n }));
  const { query, calls } = table(rows);
  const { data } = await selectByIds(["id-0", "id-1", "id-2"], query);
  assert.equal(data.length, 2500);
  assert.deepEqual(
    calls.map((c) => c.from),
    [0, 1000, 2000],
  );
});

test("repeated ids are asked for once", async () => {
  const { query, calls } = table([{ ref: "a", n: 1 }]);
  const { data } = await selectByIds(["a", "a", "a"], query);
  assert.equal(data.length, 1);
  assert.deepEqual(calls[0].ids, ["a"]);
});

test("an error from any batch comes back", async () => {
  const { data, error } = await selectByIds(["a"], () => ({ range: () => Promise.resolve({ data: null, error: { message: "boom" } }) }));
  assert.equal(error?.message, "boom");
  assert.deepEqual(data, []);
});

test("no ids, no requests", async () => {
  const { query, calls } = table([]);
  const { data } = await selectByIds([], query);
  assert.deepEqual(data, []);
  assert.equal(calls.length, 0);
});
