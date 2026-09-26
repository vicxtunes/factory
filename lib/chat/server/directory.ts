import "server-only";

// Directory adapter — the ONLY place the chat module reads the app's own
// people and order tables (profiles, workers, designers, clients, orders,
// order_items). Everything else in chat works purely with ParticipantRefs;
// this file turns them into names/avatars and answers relationship questions.

import { createAdminClient } from "@/lib/supabase/admin";

import { participantKey, reachableTypes, requiresRelationship } from "../policy";
import type { ChatPerson, ParticipantRef, ParticipantType } from "../types";

const STAFF_ROLE_LABELS: Record<string, string> = {
  boss: "Boss",
  supervisor: "Supervisor",
  receptionist: "Receptionist",
};

const CONTACT_LIMIT_PER_TYPE = 30;

function staffPerson(row: { id: string; full_name: string | null; role: string; avatar_url: string | null }): ChatPerson {
  return {
    type: "dashboard_user",
    id: row.id,
    name: row.full_name || STAFF_ROLE_LABELS[row.role] || "Staff",
    avatarUrl: row.avatar_url,
    subtitle: STAFF_ROLE_LABELS[row.role] ?? "Staff",
  };
}

function simplePerson(
  type: Exclude<ParticipantType, "dashboard_user">,
  row: { id: string; name: string; avatar_url: string | null },
): ChatPerson {
  const subtitle = type === "worker" ? "Factory" : type === "designer" ? "Designer" : "Client";
  return { type, id: row.id, name: row.name, avatarUrl: row.avatar_url, subtitle };
}

/** Placeholder for someone whose record no longer exists (e.g. a deleted client). */
function unknownPerson(ref: ParticipantRef): ChatPerson {
  return { ...ref, name: "Former user", avatarUrl: null, subtitle: "" };
}

/**
 * Resolves many people at once — one query per participant type, however
 * many people are asked for. Returned map is keyed by participantKey().
 */
export async function resolvePeople(refs: ParticipantRef[]): Promise<Map<string, ChatPerson>> {
  const byType = new Map<ParticipantType, Set<string>>();
  for (const r of refs) {
    if (!byType.has(r.type)) byType.set(r.type, new Set());
    byType.get(r.type)!.add(r.id);
  }

  const admin = createAdminClient();
  const out = new Map<string, ChatPerson>();
  const add = (p: ChatPerson) => out.set(participantKey(p), p);

  await Promise.all(
    [...byType.entries()].map(async ([type, idSet]) => {
      const ids = [...idSet];
      if (type === "dashboard_user") {
        const { data } = await admin.from("profiles").select("id, full_name, role, avatar_url").in("id", ids);
        (data ?? []).forEach((row) => add(staffPerson(row)));
      } else {
        const table = type === "worker" ? "workers" : type === "designer" ? "designers" : "clients";
        const { data } = await admin.from(table).select("id, name, avatar_url").in("id", ids);
        (data ?? []).forEach((row) => add(simplePerson(type, row)));
      }
    }),
  );

  for (const r of refs) if (!out.has(participantKey(r))) out.set(participantKey(r), unknownPerson(r));
  return out;
}

export async function resolvePerson(ref: ParticipantRef): Promise<ChatPerson> {
  return (await resolvePeople([ref])).get(participantKey(ref))!;
}

/** Whether a person record exists and is active (can receive messages). */
export async function isActivePerson(ref: ParticipantRef): Promise<boolean> {
  const admin = createAdminClient();
  if (ref.type === "dashboard_user") {
    const { data } = await admin.from("profiles").select("id").eq("id", ref.id).maybeSingle();
    return !!data;
  }
  const table = ref.type === "worker" ? "workers" : ref.type === "designer" ? "designers" : "clients";
  const { data } = await admin.from(table).select("id, active").eq("id", ref.id).maybeSingle();
  return !!data && data.active !== false;
}

/** Every staff account — used to notify "the team" about client messages. */
export async function listStaffRefs(): Promise<ParticipantRef[]> {
  const { data } = await createAdminClient().from("profiles").select("id");
  return (data ?? []).map((r) => ({ type: "dashboard_user" as const, id: r.id }));
}

// ---------------------------------------------------------------------------
// Relationships (client ↔ designer)
// ---------------------------------------------------------------------------

// "Ongoing" = not cancelled, with at least one item not yet completed. Once
// every item is delivered the designer and client lose the ability to message
// each other (their chat turns read-only) until another order links them.
function ongoingOrders(columns: string) {
  return createAdminClient()
    .from("orders")
    .select(`${columns}, order_items!inner(id)`)
    .is("cancelled_at", null)
    .neq("order_items.production_status", "completed");
}

/** Designers assigned to at least one of this client's ongoing orders. */
async function designerIdsForClient(clientId: string): Promise<string[]> {
  const { data } = await ongoingOrders("assigned_designer_id")
    .eq("client_id", clientId)
    .not("assigned_designer_id", "is", null);
  return [...new Set(((data ?? []) as unknown as { assigned_designer_id: string }[]).map((r) => r.assigned_designer_id))];
}

/** Clients with at least one ongoing order assigned to this designer. */
async function clientIdsForDesigner(designerId: string): Promise<string[]> {
  const { data } = await ongoingOrders("client_id")
    .eq("assigned_designer_id", designerId)
    .not("client_id", "is", null);
  return [...new Set(((data ?? []) as unknown as { client_id: string }[]).map((r) => r.client_id))];
}

/** True when two people share the working relationship policy requires. */
export async function haveRelationship(a: ParticipantRef, b: ParticipantRef): Promise<boolean> {
  if (a.type === "client" && b.type === "designer") return (await designerIdsForClient(a.id)).includes(b.id);
  if (a.type === "designer" && b.type === "client") return (await clientIdsForDesigner(a.id)).includes(b.id);
  return true;
}

// ---------------------------------------------------------------------------
// Contact search ("New message" picker)
// ---------------------------------------------------------------------------

/**
 * People the viewer can start a conversation with, optionally filtered by a
 * name search. Applies policy (reachable types) and relationship rules.
 */
export async function searchContacts(viewer: ParticipantRef, query: string): Promise<ChatPerson[]> {
  const admin = createAdminClient();
  const q = query.trim();
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const results: ChatPerson[] = [];

  await Promise.all(
    reachableTypes(viewer.type).map(async (type) => {
      if (type === "dashboard_user") {
        let req = admin.from("profiles").select("id, full_name, role, avatar_url").order("full_name").limit(CONTACT_LIMIT_PER_TYPE);
        if (q) req = req.ilike("full_name", like);
        const { data } = await req;
        (data ?? []).forEach((row) => results.push(staffPerson(row)));
        return;
      }

      const table = type === "worker" ? "workers" : type === "designer" ? "designers" : "clients";
      let req = admin.from(table).select("id, name, avatar_url").eq("active", true).order("name").limit(CONTACT_LIMIT_PER_TYPE);
      if (q) req = req.ilike("name", like);

      if (requiresRelationship(viewer.type, type)) {
        const ids =
          viewer.type === "client" ? await designerIdsForClient(viewer.id) : await clientIdsForDesigner(viewer.id);
        if (!ids.length) return;
        req = req.in("id", ids);
      }

      const { data } = await req;
      (data ?? []).forEach((row) => {
        const person = simplePerson(type, row);
        // Staff picking a client opens the client's support thread, which all
        // staff share. Say so up front rather than let it look like a private chat.
        if (type === "client" && viewer.type === "dashboard_user") person.subtitle = "Client · support chat, shared with all staff";
        results.push(person);
      });
    }),
  );

  return results
    .filter((p) => !(p.type === viewer.type && p.id === viewer.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderChatContext {
  orderId: string;
  orderNo: string;
  clientId: string | null;
  designerId: string | null;
}

export async function getOrderContext(orderId: string): Promise<OrderChatContext | null> {
  const { data } = await createAdminClient()
    .from("orders")
    .select("id, order_no, client_id, assigned_designer_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!data) return null;
  return { orderId: data.id, orderNo: data.order_no, clientId: data.client_id, designerId: data.assigned_designer_id };
}

/** Order numbers for many orders at once (inbox titles). */
export async function getOrderNumbers(orderIds: string[]): Promise<Map<string, string>> {
  if (!orderIds.length) return new Map();
  const { data } = await createAdminClient().from("orders").select("id, order_no").in("id", orderIds);
  return new Map((data ?? []).map((r) => [r.id as string, r.order_no as string]));
}

/** Is this person involved in the order (so may open its thread)? Staff always are. */
export async function isInvolvedInOrder(person: ParticipantRef, order: OrderChatContext): Promise<boolean> {
  switch (person.type) {
    case "dashboard_user":
      return true;
    case "client":
      // Clients talk to the team in their support thread, not order threads.
      return false;
    case "designer":
      return order.designerId === person.id;
    case "worker": {
      const { count } = await createAdminClient()
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("order_id", order.orderId)
        .eq("assigned_worker_id", person.id);
      return (count ?? 0) > 0;
    }
  }
}
