"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardSession } from "@/lib/auth/session";
import { notifyActor } from "@/lib/push/send";
import { SUPPORT_OWNER_EMAIL } from "@/lib/support/constants";
import type { AuditActorType } from "@/lib/types";

type Result = { ok: true; sent: number } | { ok: false; error: string };

export interface NotificationInput {
  title: string;
  body: string;
  url?: string;
}

export interface SubscribedActor {
  type: AuditActorType;
  id: string;
  name: string;
}

// dementaacademy@gmail.com is the owner account and, per the same reasoning
// as lib/support/actions.ts's requireOwner(), the designated sender for
// ad-hoc notifications — gated by email, not role, since several accounts
// can be "boss".
async function requireOwner(): Promise<void> {
  const session = await getDashboardSession();
  if (!session || session.email !== SUPPORT_OWNER_EMAIL) {
    throw new Error("Forbidden: owner only");
  }
}

function validate(input: NotificationInput): string | null {
  if (!input.title.trim()) return "Title can't be empty.";
  if (!input.body.trim()) return "Message can't be empty.";
  return null;
}

// Every distinct actor with at least one push subscription, with a
// human-readable name — feeds the "send to one person" picker. A given
// actor can have multiple subscriptions (multiple devices); this collapses
// to one row per actor.
export async function getSubscribedActors(): Promise<SubscribedActor[]> {
  await requireOwner();
  const admin = createAdminClient();

  const { data: subs } = await admin.from("push_subscriptions").select("subscriber_type, subscriber_id");
  if (!subs?.length) return [];

  const uniqueKeys = new Map<string, { type: AuditActorType; id: string }>();
  for (const s of subs) {
    uniqueKeys.set(`${s.subscriber_type}:${s.subscriber_id}`, { type: s.subscriber_type, id: s.subscriber_id });
  }

  const dashboardIds = [...uniqueKeys.values()].filter((a) => a.type === "dashboard_user").map((a) => a.id);
  const workerIds = [...uniqueKeys.values()].filter((a) => a.type === "worker").map((a) => a.id);
  const designerIds = [...uniqueKeys.values()].filter((a) => a.type === "designer").map((a) => a.id);

  const nameById = new Map<string, string>();

  if (dashboardIds.length) {
    const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 200 });
    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", dashboardIds);
    const fullNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string | null]));
    for (const id of dashboardIds) {
      const email = usersList?.users.find((u) => u.id === id)?.email ?? id;
      nameById.set(id, fullNameById.get(id) || email);
    }
  }
  if (workerIds.length) {
    const { data } = await admin.from("workers").select("id, name").in("id", workerIds);
    for (const w of data ?? []) nameById.set(w.id, w.name);
  }
  if (designerIds.length) {
    const { data } = await admin.from("designers").select("id, name").in("id", designerIds);
    for (const d of data ?? []) nameById.set(d.id, d.name);
  }

  return [...uniqueKeys.values()].map((a) => ({ ...a, name: nameById.get(a.id) ?? a.id }));
}

export async function sendBroadcast(input: NotificationInput): Promise<Result> {
  await requireOwner();
  const error = validate(input);
  if (error) return { ok: false, error };

  const payload = { title: input.title.trim(), body: input.body.trim(), url: input.url?.trim() || undefined };
  const actors = await getSubscribedActors();
  await Promise.all(actors.map((a) => notifyActor({ type: a.type, id: a.id }, payload)));
  return { ok: true, sent: actors.length };
}

export async function sendToActor(type: AuditActorType, id: string, input: NotificationInput): Promise<Result> {
  await requireOwner();
  const error = validate(input);
  if (error) return { ok: false, error };

  const payload = { title: input.title.trim(), body: input.body.trim(), url: input.url?.trim() || undefined };
  await notifyActor({ type, id }, payload);
  return { ok: true, sent: 1 };
}
