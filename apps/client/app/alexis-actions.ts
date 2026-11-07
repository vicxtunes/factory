"use server";

// Alexis in the client app (packages/lib/assistant/panel): the account's own
// tools, and its studio's, agency's or vendor account's on those pages.

import * as alexis from "@repo/lib/assistant/panel/app";
import { clientAppToolbox } from "@repo/lib/assistant/panel/tools/client-app";

export async function askAlexis(text: string, page: alexis.PageInput) {
  return alexis.ask(clientAppToolbox, text, page);
}

export async function confirmAlexis(id: string, path: string) {
  return alexis.confirm(clientAppToolbox, id, path);
}

export async function cancelAlexis(id: string) {
  return alexis.cancel(id);
}
