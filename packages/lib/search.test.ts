import assert from "node:assert/strict";
import { test } from "node:test";

import { matchesSearch, normalizeSearch, searchOrFilters, searchWords } from "./search";

const client = ["John Kato", "+256772123456", "john@example.com"];

test("words in any order, any case, extra spaces", () => {
  assert.ok(matchesSearch("kato john", client));
  assert.ok(matchesSearch("  JOHN   kato ", client));
  assert.ok(matchesSearch("kat", client));
  assert.ok(!matchesSearch("kato peter", client));
});

test("accents, apostrophes and punctuation don't matter", () => {
  assert.ok(matchesSearch("rene", ["René Ssali"]));
  assert.ok(matchesSearch("obrien", ["O'Brien Ltd"]));
  assert.ok(matchesSearch("o brien", ["O'Brien Ltd"]));
  assert.ok(matchesSearch("photo book", ["Photo-book 10x10"]));
  assert.ok(matchesSearch("10x10", ["Photo book 10 x 10"]));
});

test("phones in any format", () => {
  for (const typed of ["0772123456", "0772 123 456", "+256 772 123 456", "256772123456", "772123456", "123456"]) {
    assert.ok(matchesSearch(typed, client), typed);
  }
  assert.ok(matchesSearch("+256772123456", ["0772 123 456"]));
  assert.ok(matchesSearch("0772123456", ["256-772-123-456"]));
  assert.ok(!matchesSearch("0772999999", client));
});

test("order and invoice numbers with or without prefix, # or zeros", () => {
  const order = ["2026-0042", "Sarah N"];
  for (const typed of ["42", "#42", "0042", "2026-0042", "2026 42", "20260042"]) assert.ok(matchesSearch(typed, order), typed);
  assert.ok(matchesSearch("INV42", ["INV-0042"]));
  assert.ok(matchesSearch("inv-0042", ["INV0042"]));
});

test("a phone word plus a name", () => {
  assert.ok(matchesSearch("john 0772 123 456", client));
  assert.ok(!matchesSearch("peter 0772 123 456", client));
});

test("empty search finds everything; nulls are skipped", () => {
  assert.ok(matchesSearch("", client));
  assert.ok(matchesSearch("kato", [null, undefined, "", "Kato"]));
  assert.ok(matchesSearch("150000", [150000]));
});

test("normalising", () => {
  assert.equal(normalizeSearch("  Ünïcode—Test  #12 "), "unicode test 12");
  assert.deepEqual(searchWords("INV42 inv42"), ["inv", "42"]);
});

test("server filters: one per word, numbers in every form", () => {
  assert.deepEqual(searchOrFilters("kato john", ["name", "phone"]), ["name.ilike.%kato%,phone.ilike.%kato%", "name.ilike.%john%,phone.ilike.%john%"]);
  assert.deepEqual(searchOrFilters("0772 123 456", ["phone"]), ["phone.ilike.%0772123456%,phone.ilike.%772123456%"]);
  assert.deepEqual(searchOrFilters("+256772123456", ["phone"]), ["phone.ilike.%256772123456%,phone.ilike.%772123456%"]);
  assert.deepEqual(searchOrFilters("", ["name"]), []);
});
