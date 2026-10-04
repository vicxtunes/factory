import assert from "node:assert/strict";
import { test } from "node:test";

import { z } from "zod";

import { AppError, failure, GENERIC_ERROR, optionalEmail, optionalPhone, optionalText, parseInput } from "./index";

class ThingError extends AppError {}

test("failure passes AppError messages (and subclasses) through", () => {
  assert.deepEqual(failure(new AppError("Choose a product.")), { ok: false, error: "Choose a product." });
  assert.deepEqual(failure(new ThingError("Gone.")), { ok: false, error: "Gone." });
});

test("failure hides anything that isn't an AppError", () => {
  assert.deepEqual(failure(new Error("relation \"x\" does not exist")), { ok: false, error: GENERIC_ERROR });
  assert.deepEqual(failure("boom"), { ok: false, error: GENERIC_ERROR });
});

test("AppError subclasses keep their name", () => {
  assert.equal(new ThingError("x").name, "ThingError");
  assert.ok(new ThingError("x") instanceof AppError);
});

const schema = z.object({
  name: z.string().trim().min(1, "Give it a name."),
  value: z.number("Enter a number.").int("Use a whole number.").positive("Use a whole number.").max(100),
});

test("parseInput returns the parsed, typed value", () => {
  assert.deepEqual(parseInput(schema, { name: "  Sale ", value: 10 }), { name: "Sale", value: 10 });
});

test("parseInput throws one AppError with each distinct message", () => {
  assert.throws(
    () => parseInput(schema, { name: " ", value: 1.5 }),
    (err) => err instanceof AppError && err.message === "Give it a name. Use a whole number.",
  );
});

test("parseInput rejects input that isn't the expected shape", () => {
  assert.throws(() => parseInput(schema, null), AppError);
  assert.throws(() => parseInput(schema, { name: "x", value: "10" }), /Enter a number\./);
});

test("optional fields trim, and empty becomes null", () => {
  assert.equal(parseInput(optionalText(10, "Too long."), "  "), null);
  assert.equal(parseInput(optionalText(10, "Too long."), " hi "), "hi");
  assert.throws(() => parseInput(optionalText(3, "Too long."), "abcd"), /Too long\./);
  assert.equal(parseInput(optionalEmail(), ""), null);
  assert.throws(() => parseInput(optionalEmail(), "nope"), /valid email/);
});

test("optionalPhone stores one form per number", () => {
  assert.equal(parseInput(optionalPhone(), ""), null);
  assert.equal(parseInput(optionalPhone(), "0772 123 456"), "+256772123456");
  assert.equal(parseInput(optionalPhone(), "+256 772 123456"), "+256772123456");
  assert.equal(parseInput(optionalPhone(), "+44 20 7946 0958"), "+442079460958");
  assert.throws(() => parseInput(optionalPhone(), "call me"), /valid phone number/);
});
