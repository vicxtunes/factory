// Who may see Accounts. Pure; used by the navigation and the server check.

import type { AppRole } from "@repo/lib/types";

/** Business-wide money totals: the boss only (owner, 2026-11-12: supervisors manage production only). */
export function canViewAccounts(role: AppRole): boolean {
  return role === "boss";
}
