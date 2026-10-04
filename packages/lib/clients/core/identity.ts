// A client's identity: their real first and last name. Pure; safe on client
// and server.

import { z } from "zod";

/** Letters (any language, with accents), spaces, hyphens, apostrophes and dots; 2–50 long; no digits or symbols. */
const NAME = /^[\p{L}][\p{L}\p{M}' ’.-]*[\p{L}\p{M}.]$/u;

const namePart = (label: string) =>
  z
    .string(`Enter your ${label}.`)
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(2, `Enter your ${label} (at least 2 letters).`)
        .max(50, `Keep your ${label} under 50 characters.`)
        .regex(NAME, `Use letters only for your ${label}.`),
    );

export const identitySchema = z.object({
  firstName: namePart("first name"),
  lastName: namePart("last name"),
});

export type Identity = z.output<typeof identitySchema>;

/** The display name: "First Last". */
export const fullName = (i: Identity) => `${i.firstName} ${i.lastName}`;

/**
 * A first guess from a name typed in freely (often by staff): the first word,
 * and the rest. Anything that isn't a letter is dropped ("Grace N. 0772…" →
 * "Grace", "N."). The client confirms or corrects it.
 */
export function splitName(name: string): { firstName: string; lastName: string } {
  const words = name
    .replace(/[^\p{L}\p{M}' ’.\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  return { firstName: words[0] ?? "", lastName: words.slice(1).join(" ") };
}
