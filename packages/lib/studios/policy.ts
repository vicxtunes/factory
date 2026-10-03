// Who can do what with studios. Pure.
//
// A client only ever reaches their own studio: actions find it from the
// client's session, never from an id the browser sends. Staff see studios
// only through the boss's oversight pages.

import type { AppRole } from "@repo/lib/types";

/** The boss oversees the whole platform, every studio included. */
export function canViewAllStudios(role: AppRole): boolean {
  return role === "boss";
}
