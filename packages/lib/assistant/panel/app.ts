import "server-only";

import * as panel from "./server";
import { pageLinksSchema, type Toolbox } from "./toolbox";

// What each app's own Alexis server actions call (apps/*/app/alexis-actions.ts).
// The app builds the toolbox for whoever is signed in, from its own guarded
// functions; the rest is the same everywhere.

/** The tools for this person on this page. Built again on Confirm, so a change the person can no longer make won't run. */
export type BuildToolbox = (person: panel.Person, page: string) => Promise<Toolbox>;

export interface PageInput {
  path: string;
  title: string;
  links: unknown;
}

const pathOf = (path: unknown) => String(path ?? "/").slice(0, 300);
const NOT_SIGNED_IN = { ok: false as const, error: "Sign in to use Alexis." };

export async function ask(build: BuildToolbox, chatId: unknown, text: unknown, page: PageInput, files: unknown): Promise<panel.SendResult> {
  const person = await panel.currentPerson();
  if (!person) return NOT_SIGNED_IN;
  const path = pathOf(page?.path);
  const links = pageLinksSchema.parse(page?.links).filter((l) => l.href.startsWith("/") && !l.href.startsWith("//"));
  const names = Array.isArray(files) ? files.map((f) => String(f)) : [];
  return panel.send(
    person,
    typeof chatId === "string" && chatId ? chatId : null,
    String(text ?? ""),
    { path, title: String(page?.title ?? "").slice(0, 120), links },
    await build(person, path),
    "app",
    names,
  );
}

export async function confirm(build: BuildToolbox, id: unknown, path: unknown): Promise<panel.DecideResult> {
  const person = await panel.currentPerson();
  if (!person) return NOT_SIGNED_IN;
  return panel.confirm(person, String(id), await build(person, pathOf(path)));
}

export async function cancel(id: unknown): Promise<panel.DecideResult> {
  const person = await panel.currentPerson();
  if (!person) return NOT_SIGNED_IN;
  return panel.cancel(person, String(id));
}
