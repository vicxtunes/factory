import "server-only";

import { panelSettings } from "@repo/lib/assistant/panel/server";
import { isPro } from "@repo/lib/pro/core";
import { proStatus } from "@repo/lib/pro/server";

/** Whether this business's page has the chat (./core.ts): Pro, and the AI not switched off. */
export async function businessChatOn(tenantId: string): Promise<boolean> {
  const [status, settings] = await Promise.all([proStatus(tenantId), panelSettings()]);
  return isPro(status) && settings.panelMode !== "off";
}
