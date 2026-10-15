// Renaming many files and folders at once. Pure.
//
// Either a pattern ("Nakato-Wedding-{#}": {name} is the old name, {#} the
// number, {date} the day it was added) or find and replace. A file keeps its
// extension; names are cleaned as one typed by hand would be, and a new name
// may not clash with another in the folder (whatever the capitals).

import { cleanName, MAX_FILE_NAME, MAX_FOLDER_NAME } from "./rules";

export type RenameRule =
  | { mode: "pattern"; pattern: string; start: number; digits: number; order: "name" | "date" }
  | { mode: "replace"; find: string; replace: string; matchCase: boolean };

export interface RenameItem {
  kind: "file" | "folder";
  id: string;
  name: string;
  /** ISO timestamp, when known (files). */
  createdAt: string | null;
}

export interface RenamePlan {
  kind: "file" | "folder";
  id: string;
  from: string;
  to: string;
  /** Why this one can't be renamed so; null when it's fine. */
  problem: string | null;
}

/** "photo.final.JPG" → ["photo.final", ".JPG"]; folders and names without one keep it empty. */
function splitExtension(item: Pick<RenameItem, "kind" | "name">): [string, string] {
  const dot = item.name.lastIndexOf(".");
  return item.kind === "file" && dot > 0 ? [item.name.slice(0, dot), item.name.slice(dot)] : [item.name, ""];
}

const byName = (a: RenameItem, b: RenameItem) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
const byDate = (a: RenameItem, b: RenameItem) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || byName(a, b);

/**
 * The new name of each item, in the order they'll be numbered, with any
 * problem: a name that's empty or too long once cleaned, or that clashes with
 * another new name or with something else in the folder (`others`: the names
 * there that aren't being renamed).
 */
export function planRenames(items: RenameItem[], rule: RenameRule, others: string[]): RenamePlan[] {
  const ordered = rule.mode === "pattern" ? [...items].sort(rule.order === "date" ? byDate : byName) : [...items].sort(byName);
  const planned = ordered.map((item, i) => {
    const [stem, extension] = splitExtension(item);
    let base: string;
    if (rule.mode === "pattern") {
      const number = String(rule.start + i).padStart(rule.digits, "0");
      base = rule.pattern
        .replaceAll("{name}", stem)
        .replaceAll("{#}", number)
        .replaceAll("{date}", item.createdAt?.slice(0, 10) ?? "");
    } else {
      base = rule.find ? stem.replace(new RegExp(escapeRegExp(rule.find), rule.matchCase ? "g" : "gi"), rule.replace) : stem;
    }
    return { kind: item.kind, id: item.id, from: item.name, to: cleanName(base) ? cleanName(base) + extension : "" };
  });

  const taken = new Map<string, number>();
  for (const name of [...others, ...planned.map((p) => p.to)]) taken.set(name.toLowerCase(), (taken.get(name.toLowerCase()) ?? 0) + 1);
  return planned.map((p) => ({
    ...p,
    problem: !p.to
      ? "Needs a name."
      : p.to.length > (p.kind === "file" ? MAX_FILE_NAME : MAX_FOLDER_NAME)
        ? "Too long."
        : (taken.get(p.to.toLowerCase()) ?? 0) > 1
          ? "Clashes with another name here."
          : null,
  }));
}

/** Whether a pattern numbers its items, so no two get the same name ({#}). */
export const patternNumbers = (pattern: string) => pattern.includes("{#}");

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
