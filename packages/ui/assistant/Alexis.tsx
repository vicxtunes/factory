import { currentPerson, panelVisible } from "@repo/lib/assistant/panel/server";

import { AlexisPanel } from "./AlexisPanel";

/** The Alexis button, for whoever is signed in and may use it. Goes once in each app's root layout. */
export async function Alexis() {
  const visible = await currentPerson()
    .then(panelVisible)
    .catch((err) => {
      console.error("alexis panel:", err);
      return false;
    });
  return visible ? <AlexisPanel /> : null;
}
