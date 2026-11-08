// Reading /api/alexis's stream: lines of JSON that may arrive split across
// network chunks, or several in one. Pure, used by the browser.

/** Adds a chunk to what's held back; returns the complete lines and the start of the next. */
export function takeLines(held: string, chunk: string): { lines: string[]; held: string } {
  const parts = (held + chunk).split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.filter((l) => l.trim()), held: rest };
}
