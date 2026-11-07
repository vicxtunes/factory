import type { PersonType } from "@repo/lib/assistant/panel/core";
import { currentPerson, panelState, panelVisible } from "@repo/lib/assistant/panel/server";

import type { AlexisActions } from "./AlexisChat";
import { AlexisPage } from "./AlexisPage";
import { AlexisPanel } from "./AlexisPanel";

/**
 * The Alexis button, for whoever is signed in and may use it. Goes once in each
 * app's root layout, with that app's own server actions (apps/*\/app/alexis-actions.ts)
 * and where its full Alexis page is for each kind of person (none: no "All chats").
 */
export async function Alexis({ actions, pages }: { actions: AlexisActions; pages: Partial<Record<PersonType, string>> }) {
  const person = await currentPerson().catch(() => null);
  const visible = await panelVisible(person).catch((err) => {
    console.error("alexis panel:", err);
    return false;
  });
  return visible && person ? <AlexisPanel actions={actions} fullPage={pages[person.type] ?? null} /> : null;
}

/** An app's full Alexis page: the person's chats, the newest open. `path` is the page's own address. */
export async function AlexisFullPage({ actions, path }: { actions: AlexisActions; path: string }) {
  const person = await currentPerson();
  const state = person ? await panelState(person, path) : { kind: "off" as const };
  return <AlexisPage actions={actions} initial={state} />;
}
