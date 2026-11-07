import { currentPerson, panelVisible } from "@repo/lib/assistant/panel/server";

import { AlexisPanel, type AlexisActions } from "./AlexisPanel";

/**
 * The Alexis button, for whoever is signed in and may use it. Goes once in each
 * app's root layout, with that app's own server actions (apps/*\/app/alexis-actions.ts).
 */
export async function Alexis({ actions }: { actions: AlexisActions }) {
  const visible = await currentPerson()
    .then(panelVisible)
    .catch((err) => {
      console.error("alexis panel:", err);
      return false;
    });
  return visible ? <AlexisPanel actions={actions} /> : null;
}
