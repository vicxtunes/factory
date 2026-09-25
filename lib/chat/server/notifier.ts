import "server-only";

// Push-notification adapter — the ONLY place chat touches lib/push. Swap
// this file to deliver chat notifications some other way (email, SMS, …).

import { notifyActor } from "@/lib/push/send";

import { chatHref } from "../routes";
import type { ParticipantRef } from "../types";

export interface ChatNotification {
  /** Conversation title, e.g. the sender's name or "Order #2026-3956". */
  title: string;
  body: string;
  conversationId: string;
}

const PREVIEW_LENGTH = 120;

/** Sends a push to each recipient. Best-effort; never throws. */
export async function notifyRecipients(recipients: ParticipantRef[], n: ChatNotification): Promise<void> {
  const body = n.body.length > PREVIEW_LENGTH ? `${n.body.slice(0, PREVIEW_LENGTH - 1)}…` : n.body;
  await Promise.all(
    recipients.map((r) =>
      notifyActor({ type: r.type, id: r.id }, { title: n.title, body, url: chatHref(n.conversationId) }),
    ),
  );
}
