"use server";

// Alexis in the staff app (packages/lib/assistant/panel): the tools for the
// signed-in staff member, designer or worker (./alexis-tools.ts).

import * as alexis from "@repo/lib/assistant/panel/app";

import { staffAppToolbox } from "./alexis-tools";

export async function askAlexis(chatId: string | null, text: string, page: alexis.PageInput, files: string[]) {
  return alexis.ask(staffAppToolbox, chatId, text, page, files);
}

export async function confirmAlexis(id: string, path: string) {
  return alexis.confirm(staffAppToolbox, id, path);
}

export async function cancelAlexis(id: string) {
  return alexis.cancel(id);
}
