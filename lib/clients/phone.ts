// Phone validation for the Google sign-up/link step.
//
// The DB matcher (norm_client_phone in migration 20260910120000) folds numbers
// as Ghana (+233): "0700768312" and "+256700768312" — the same Ugandan number —
// get different keys and would NOT match, so a client typing a different format
// than the office once did would be duplicated instead of linked. This parses a
// typed number and returns every form an existing record might hold, so the
// caller can search all of them, plus the one canonical form to store.
//
// Uganda is the home market (UGX pricing, +256 support line); anything that
// isn't a Ugandan shape is accepted as a generic international number.

export type ParsedPhone =
  | { ok: true; store: string; variants: string[] }
  | { ok: false; error: string };

const INVALID = "Enter a valid phone number, for example 0700 768 312.";

export function parsePhone(input: string): ParsedPhone {
  const raw = input.trim();
  if (raw.length > 20) return { ok: false, error: INVALID };
  // Only digits, spaces and the usual separators, with an optional leading +.
  if (!/^\+?[\d\s().-]+$/.test(raw)) return { ok: false, error: INVALID };

  const plus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");

  // Ugandan: 0XXXXXXXXX, 256XXXXXXXXX / +256XXXXXXXXX, or a bare 9 digits.
  let national: string | null = null;
  if (!plus && digits.length === 10 && digits.startsWith("0")) national = digits;
  else if (digits.length === 12 && digits.startsWith("256")) national = `0${digits.slice(3)}`;
  else if (!plus && digits.length === 9 && /^[347]/.test(digits)) national = `0${digits}`;
  if (national) {
    // Stored in the national form the office types; searched in both.
    return { ok: true, store: national, variants: [national, `+256${national.slice(1)}`] };
  }

  // Any other international number (E.164 allows 8–15 digits).
  if (plus && digits.length >= 8 && digits.length <= 15 && !digits.startsWith("0")) {
    return { ok: true, store: `+${digits}`, variants: [`+${digits}`] };
  }
  return { ok: false, error: INVALID };
}
