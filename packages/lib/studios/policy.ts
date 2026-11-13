// Who can do what with studios. Pure.
//
// A client only ever reaches their own studio: actions find it from the
// client's session, never from an id the browser sends. Staff see studios
// only through the Businesses pages (staff access: studios).

/**
 * Which business an account opens on this device: the id of one it works for,
 * or null for its own. What this device chose comes first. With no choice, its
 * own once that's open for business; a draft it never finished (or one that's
 * stopped) never stands in the way of a business it works for.
 */
export function businessToOpen(chosen: string | undefined, workingFor: string[], own: { active: boolean } | null): string | null {
  if (chosen && workingFor.includes(chosen)) return chosen;
  if (own && (chosen === "own" || own.active)) return null;
  return workingFor[0] ?? null;
}
