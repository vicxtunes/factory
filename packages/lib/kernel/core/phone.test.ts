import assert from "node:assert/strict";
import { test } from "node:test";

import { countryOfPhone, parsePhone, phoneCountries, phoneForEditing, phoneInCountry, whatsappNumber } from "./phone";

const stored = (input: string, country?: Parameters<typeof parsePhone>[1]) => {
  const parsed = parsePhone(input, country);
  return parsed.ok ? parsed.store : parsed.error;
};

test("every way of typing a Ugandan number is the same number", () => {
  for (const typed of ["0703360688", "703360688", "256703360688", "+256703360688", "+256 703-360-688", "(0703) 360 688", "00256703360688"]) {
    assert.equal(stored(typed), "+256703360688", typed);
  }
});

test("another country: picked, or given with +", () => {
  assert.equal(stored("0712 345 678", "KE"), "+254712345678");
  assert.equal(stored("+254 712 345678"), "+254712345678");
  assert.equal(stored("+44 20 7946 0958"), "+442079460958");
});

test("not a real number: refused, saying why where it can", () => {
  assert.equal(stored("0703 36068"), "Enter a valid phone number, for example 0703 360 688.");
  assert.equal(stored("07033606881"), "This phone number is too long.");
  assert.equal(stored("0703"), "This phone number is too short.");
  assert.match(stored("0123456789"), /valid phone number/);
  assert.match(stored("call me"), /valid phone number/);
  assert.match(stored(""), /valid phone number/);
});

test("the phone box: typed text to international, stored number back to text", () => {
  assert.equal(phoneInCountry("0703 360 688", "UG"), "+256703360688");
  assert.equal(phoneInCountry("0712 345 678", "KE"), "+254712345678");
  assert.equal(phoneInCountry("call me", "UG"), "call me", "not a number: left for the server to explain");
  assert.deepEqual(phoneForEditing("+256703360688"), { country: "UG", text: "0703 360688" });
  assert.deepEqual(phoneForEditing("0703360688"), { country: "UG", text: "0703 360688" }, "older records");
  assert.deepEqual(phoneForEditing("+254712345678"), { country: "KE", text: "0712 345678" });
  assert.deepEqual(phoneForEditing(null), { country: "UG", text: "" });
  assert.equal(countryOfPhone("+254712345678"), "KE");
  assert.equal(countryOfPhone("0703360688"), undefined);
});

test("country list and WhatsApp numbers", () => {
  const countries = phoneCountries();
  assert.ok(countries.length > 200);
  assert.deepEqual(countries.find((c) => c.code === "UG"), { code: "UG", name: "Uganda", dial: "+256" });
  assert.equal(whatsappNumber("+256703360688"), "256703360688");
  assert.equal(whatsappNumber("0703360688"), "256703360688");
});
