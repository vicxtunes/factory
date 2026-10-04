// Phone numbers: validation and the one form to store. Used by client sign-in,
// staff client forms and studios (customers, profile, team). Pure; safe in the
// browser (PhoneInput uses it too).
//
// Every number is stored in international form, "+256703360688", so the same
// number always matches however it was typed: 0703360688, 703360688,
// 256703360688, +256 703 360 688 and 00256703360688 are all that one number.
// Without a "+", a number is read as the chosen country's (Uganda by default).
// The database folds older records the same way (norm_client_phone).

import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from "libphonenumber-js/min";

export type { CountryCode };

/** The home market: numbers without a country code are Ugandan unless another country is picked. */
export const DEFAULT_COUNTRY: CountryCode = "UG";

export type ParsedPhone = { ok: true; store: string } | { ok: false; error: string };

const INVALID = "Enter a valid phone number, for example 0703 360 688.";

/** "00256…" is how some phones dial abroad: the same as "+256…". */
const normalisePrefix = (raw: string) => raw.trim().replace(/^00/, "+");

/** Checks a typed number and gives the form to store ("+256703360688"). */
export function parsePhone(input: string, country: CountryCode = DEFAULT_COUNTRY): ParsedPhone {
  const raw = normalisePrefix(input);
  // Only digits, spaces and the usual separators, with an optional leading +.
  if (raw.length > 25 || !/^\+?[\d\s().-]+$/.test(raw)) return { ok: false, error: INVALID };

  const phone = parsePhoneNumberFromString(raw, country);
  if (phone?.isValid()) return { ok: true, store: phone.number };

  const length = validatePhoneNumberLength(raw, country);
  if (length === "TOO_SHORT") return { ok: false, error: "This phone number is too short." };
  if (length === "TOO_LONG") return { ok: false, error: "This phone number is too long." };
  return { ok: false, error: INVALID };
}

/** The international form of what's typed with `country` picked, or the text as typed if it isn't a number yet (the server then explains). */
export function phoneInCountry(text: string, country: CountryCode): string {
  const raw = normalisePrefix(text);
  return parsePhoneNumberFromString(raw, country)?.number ?? raw;
}

/** A stored number split for editing: its country and the number as people there write it ("0703 360 688"). */
export function phoneForEditing(stored: string | null): { country: CountryCode; text: string } {
  const phone = stored ? parsePhoneNumberFromString(normalisePrefix(stored), DEFAULT_COUNTRY) : undefined;
  if (phone?.country) return { country: phone.country, text: phone.formatNational() };
  return { country: DEFAULT_COUNTRY, text: stored ?? "" };
}

/** The country a typed "+…" number belongs to, if it's recognisable yet. */
export function countryOfPhone(text: string): CountryCode | undefined {
  return parsePhoneNumberFromString(normalisePrefix(text))?.country;
}

export interface PhoneCountry {
  code: CountryCode;
  name: string;
  dial: string;
}

/** Every country with its calling code, by name. */
export function phoneCountries(locale = "en"): PhoneCountry[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return getCountries()
    .map((code) => ({ code, name: names.of(code) ?? code, dial: `+${getCountryCallingCode(code)}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A stored number as wa.me wants it, international digits without "+": 0700… → 256700…; empty when there's none. */
export function whatsappNumber(phone: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) return `256${digits.slice(1)}`;
  return digits;
}
