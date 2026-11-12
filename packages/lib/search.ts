// One search rule for every search box (owner, 2026-11-12: "we search things
// and don't find them yet they are there"). Pure.
//
//   * every word typed must be found, in any order and in any of the fields;
//   * case, accents, punctuation and extra spaces don't matter;
//   * letters and digits stuck together are separate words ("INV42" = "inv 42");
//   * a number also matches inside phone numbers and order numbers however
//     they're written: 0772 123 456, +256772123456 and 772123456 are the same
//     phone; 42 finds order 2026-0042.

type Field = string | number | null | undefined;

/** Lower case, no accents or apostrophes, other punctuation as spaces, spaces squeezed. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/(\p{L})(\p{N})|(\p{N})(\p{L})/gu, (_, a, b, c, d) => (a ? `${a} ${b}` : `${c} ${d}`))
    .replace(/(\p{L})(\p{N})|(\p{N})(\p{L})/gu, (_, a, b, c, d) => (a ? `${a} ${b}` : `${c} ${d}`))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The words of a search, each normalised. Empty: show everything. */
export function searchWords(query: string): string[] {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  return [...new Set(words)];
}

/**
 * The forms a number may be written in elsewhere: as typed, without leading
 * zeros, and without Uganda's country code (+256 772… = 0772…).
 */
export function numberForms(word: string): string[] {
  if (!/^\d+$/.test(word)) return [word];
  const forms = new Set([word]);
  const noZeros = word.replace(/^0+/, "");
  if (noZeros) forms.add(noZeros);
  if (word.startsWith("256") && word.length > 6) forms.add(word.slice(3));
  return [...forms];
}

/** A query whose words are already split, so each record doesn't redo it. */
export interface PreparedSearch {
  words: string[];
  /** All the digits typed, joined: a phone typed with spaces ("0772 123 456"). */
  digits: string;
}

export function prepareSearch(query: string): PreparedSearch {
  const words = searchWords(query);
  const digits = words.filter((w) => /^\d+$/.test(w)).join("");
  return { words, digits };
}

/** Whether a record with these fields is found by the search. */
export function matchesSearch(query: string | PreparedSearch, fields: Field[]): boolean {
  const q = typeof query === "string" ? prepareSearch(query) : query;
  if (!q.words.length) return true;
  const values = fields.filter((f): f is string | number => f !== null && f !== undefined && f !== "").map(String);
  const text = ` ${values.map(normalizeSearch).join(" ")} `;
  const digits = ` ${values.map((v) => v.replace(/\D/g, "")).filter(Boolean).join(" ")} `;
  const found = (w: string) => numberForms(w).some((f) => text.includes(f) || (/^\d+$/.test(f) && digits.includes(f)));
  if (q.words.every(found)) return true;
  // A phone typed in pieces, "0772 123 456": the digits together, the other words as usual.
  if (q.digits.length >= 6) {
    const others = q.words.filter((w) => !/^\d+$/.test(w));
    return numberForms(q.digits).some((f) => digits.includes(f)) && others.every(found);
  }
  return false;
}

/** Escapes a word for a PostgREST ilike pattern inside or(). */
function likeWord(word: string): string {
  return word.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * PostgREST or() filters for a server-side search: one per word, each to be
 * applied with its own .or() so every word must be found in one of the
 * columns. Numbers are tried in all their forms. The database doesn't fold
 * accents or punctuation the way normalizeSearch does, so a result can be a
 * little wider or narrower than on screen; the screen still filters it.
 */
export function searchOrFilters(query: string, columns: string[]): string[] {
  const { words, digits } = prepareSearch(query);
  // A phone typed in pieces is looked for as one number.
  const pieces = digits.length >= 6 && words.filter((w) => /^\d+$/.test(w)).length > 1 ? [...words.filter((w) => !/^\d+$/.test(w)), digits] : words;
  return pieces.map((w) => numberForms(w).flatMap((f) => columns.map((c) => `${c}.ilike.%${likeWord(f)}%`)).join(","));
}
