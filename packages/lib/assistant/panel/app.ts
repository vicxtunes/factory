import "server-only";

import * as panel from "./server";
import type { Toolbox } from "./toolbox";

// What each app's own Alexis server actions call (apps/*/app/alexis-actions.ts).
// The app builds the toolbox for whoever is signed in, from its own guarded
// functions; the rest is the same everywhere.

/** The tools for this person on this page. Built again on Confirm, so a change the person can no longer make won't run. */
export type BuildToolbox = (person: panel.Person, page: string) => Promise<Toolbox>;

const pathOf = (path: unknown) => String(path ?? "/").slice(0, 300);
const NOT_SIGNED_IN = { ok: false as const, error: "Sign in to use Alexis." };

export async function confirm(build: BuildToolbox, id: unknown, path: unknown): Promise<panel.DecideResult> {
  const person = await panel.currentPerson();
  if (!person) return NOT_SIGNED_IN;
  return panel.confirm(person, String(id), await build(person, pathOf(path)), pathOf(path));
}

export async function cancel(id: unknown): Promise<panel.DecideResult> {
  const person = await panel.currentPerson();
  if (!person) return NOT_SIGNED_IN;
  return panel.cancel(person, String(id));
}
