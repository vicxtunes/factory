"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { CLIENT_COOKIE, signPayload } from "@/lib/auth/cookies";
import { getClientSession } from "@/lib/auth/session";
import { hashPin, isValidPinFormat, verifyPin } from "@/lib/auth/pin";
import { logOrderEvent, resolveActor } from "@/lib/audit/log";
import {
  exactClientMatch,
  findClientCandidates,
  resolveOrCreateClient,
  type ClientCandidate,
} from "@/lib/clients/dedupe";
import { parsePhone } from "@/lib/clients/phone";
import { buildAndInsertOrder } from "@/lib/orders/create";
import { isPhotobookCategory } from "@/lib/orders/photobook";
import type { CreateOrderResult, OrderItemInput } from "@/lib/orders/types";
import { notifyActor } from "@/lib/push/send";
import { fetchClientNotifications } from "@/lib/queries";
import type { NotificationRow, OrderType } from "@/lib/types";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // "remembered on device", same as worker/designer sessions
const NAME_MAX = 100;

type ActionResult = { ok: true } | { ok: false; error: string };

async function setClientCookie(clientId: string, name: string): Promise<void> {
  const store = await cookies();
  store.set(CLIENT_COOKIE, await signPayload({ client_id: clientId, name }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

// Clients sign in with just a phone number. Security is opt-in: by default an
// account only needs a matching phone number to log in (no PIN at signup). A
// client can add a PIN later from /client-side/settings (setPin below) —
// once one exists, continueLogin requires it. checkAccount lets the login
// form know, after the phone step, whether to ask for a name (new account)
// or a PIN (returning + PIN enabled).

// The client, if any, that holds this phone number — searched in every format
// it might be stored in (see lib/clients/phone.ts): the DB matcher folds
// numbers as Ghana (+233), so "0700768312" and "+256700768312" — the same
// Ugandan number — would otherwise look like two different clients.
async function clientByPhone(
  admin: ReturnType<typeof createAdminClient>,
  variants: string[],
): Promise<ClientCandidate | null> {
  const seen = new Map<string, ClientCandidate>();
  for (const phone of variants) {
    for (const c of await findClientCandidates(admin, { phone })) seen.set(c.id, c);
  }
  return exactClientMatch([...seen.values()]);
}

export async function checkAccount(phone: string): Promise<{ exists: boolean; pinRequired: boolean; error?: string }> {
  const parsed = parsePhone(phone);
  if (!parsed.ok) return { exists: false, pinRequired: false, error: parsed.error };

  const admin = createAdminClient();
  const match = await clientByPhone(admin, parsed.variants);
  if (!match || !match.active) return { exists: false, pinRequired: false };

  const { data: cred } = await admin
    .from("client_credentials")
    .select("client_id")
    .eq("client_id", match.id)
    .maybeSingle();
  return { exists: true, pinRequired: !!cred };
}

export async function continueLogin(input: {
  phone: string;
  name?: string;
  email?: string;
  pin?: string;
}): Promise<ActionResult> {
  const parsed = parsePhone(input.phone);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const admin = createAdminClient();
  const match = await clientByPhone(admin, parsed.variants);

  if (match) {
    if (!match.active) return { ok: false, error: "This account is inactive — contact us for help." };

    const { data: cred } = await admin
      .from("client_credentials")
      .select("pin_hash")
      .eq("client_id", match.id)
      .maybeSingle();
    if (cred) {
      if (!input.pin) return { ok: false, error: "PIN required." };
      if (!(await verifyPin(input.pin, cred.pin_hash))) return { ok: false, error: "Incorrect PIN." };
    }

    await setClientCookie(match.id, match.name);
    return { ok: true };
  }

  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (name.length > NAME_MAX) return { ok: false, error: `Name must be ${NAME_MAX} characters or fewer.` };

  const resolved = await resolveOrCreateClient(admin, {
    name,
    phone: parsed.store,
    email: input.email,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };

  await setClientCookie(resolved.client.id, resolved.client.name);
  return { ok: true };
}

// --- Opt-in PIN security (settings page) -----------------------------------

export async function setPin(pin: string): Promise<ActionResult> {
  const session = await getClientSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!isValidPinFormat(pin)) return { ok: false, error: "PIN must be 4-8 digits." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("client_credentials")
    .select("client_id")
    .eq("client_id", session.client_id)
    .maybeSingle();
  if (existing) return { ok: false, error: "A PIN is already set — use Change PIN instead." };

  const { error } = await admin
    .from("client_credentials")
    .insert({ client_id: session.client_id, pin_hash: await hashPin(pin) });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function changePin(input: { currentPin: string; newPin: string }): Promise<ActionResult> {
  const session = await getClientSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!isValidPinFormat(input.newPin)) return { ok: false, error: "PIN must be 4-8 digits." };

  const admin = createAdminClient();
  const { data: cred } = await admin
    .from("client_credentials")
    .select("pin_hash")
    .eq("client_id", session.client_id)
    .maybeSingle();
  if (!cred) return { ok: false, error: "No PIN is set yet — add one instead." };
  if (!(await verifyPin(input.currentPin, cred.pin_hash))) {
    return { ok: false, error: "Current PIN is incorrect." };
  }

  const { error } = await admin
    .from("client_credentials")
    .update({ pin_hash: await hashPin(input.newPin) })
    .eq("client_id", session.client_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removePin(currentPin: string): Promise<ActionResult> {
  const session = await getClientSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: cred } = await admin
    .from("client_credentials")
    .select("pin_hash")
    .eq("client_id", session.client_id)
    .maybeSingle();
  if (!cred) return { ok: true }; // already no PIN
  if (!(await verifyPin(currentPin, cred.pin_hash))) {
    return { ok: false, error: "Current PIN is incorrect." };
  }

  const { error } = await admin.from("client_credentials").delete().eq("client_id", session.client_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function logoutClient(): Promise<void> {
  const store = await cookies();
  store.delete(CLIENT_COOKIE);
}

export interface ClientOrderPayload {
  order_type: OrderType;
  delivery_date: string;
  order_notes: string;
  items: OrderItemInput[];
}

export async function placeOrder(input: ClientOrderPayload): Promise<CreateOrderResult> {
  const session = await getClientSession();
  if (!session) return { ok: false, error: "Not signed in." };

  if (!input.delivery_date) return { ok: false, error: "Delivery date is required." };

  const admin = createAdminClient();
  const { data: client, error } = await admin
    .from("clients")
    .select("id, name, email, phone")
    .eq("id", session.client_id)
    .single();
  if (error || !client) return { ok: false, error: "Your account could not be found." };

  // No quote or client approval: every order lands in the receptionist's
  // incoming queue, she checks it's filled in properly, receives it and picks
  // where it goes (receiveClientOrder in app/dashboard/actions.ts). Photo
  // books additionally need her to phone the client first.
  const categoryIds = [...new Set(input.items.map((i) => i.category_id).filter(Boolean))];
  const { data: categories } = categoryIds.length
    ? await admin.from("product_categories").select("id, name").in("id", categoryIds)
    : { data: [] };
  const needsCall = (categories ?? []).some((c) => isPhotobookCategory(c.name));

  const res = await buildAndInsertOrder(admin, {
    client,
    agentId: null,
    agentName: null,
    designer: null,
    route: "factory",
    orderType: input.order_type,
    deliveryDate: input.delivery_date,
    deadlineAt: "",
    orderNotes: input.order_notes,
    designerBrief: "",
    responsibleWorkerId: null,
    items: input.items,
    releaseImmediately: false,
  });

  if (!res.ok) return res;

  {
    const { data: managers } = await admin.from("profiles").select("id").in("role", ["receptionist", "supervisor", "boss"]);
    await Promise.all(
      (managers ?? []).map((m) =>
        notifyActor(
          { type: "dashboard_user", id: m.id },
          {
            title: needsCall ? "Photo book order — call the client" : "New client order",
            body: `Order ${res.orderNo} from ${client.name}${client.phone ? ` (${client.phone})` : ""}`,
            url: "/dashboard/order-approvals",
          },
        ),
      ),
    );
  }

  revalidatePath("/client-side");
  revalidatePath("/client-side/history");
  return { ...res, warnings: [] };
}

// The client's half of the receptionist quote/approval loop (see
// app/dashboard/actions.ts's quoteOrder/routeApprovedOrder). Only valid
// while awaiting_client_approval, and only for the order's own client —
// this repo's RLS is wide open (select-only, enforced at the query layer
// everywhere else too), so that ownership check is load-bearing here.
export async function respondToQuote(
  orderId: string,
  decision: "approve" | "changes_requested",
  note?: string,
): Promise<ActionResult> {
  const session = await getClientSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, client_id, approval_status, order_no")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.client_id !== session.client_id) return { ok: false, error: "Order not found." };
  if (order.approval_status !== "awaiting_client_approval") {
    return { ok: false, error: "This order isn't awaiting your response." };
  }

  const updates =
    decision === "approve"
      ? { approval_status: "approved" as const, client_decision_note: null }
      : { approval_status: "changes_requested" as const, client_decision_note: note?.trim() || null };

  const { error } = await admin.from("orders").update(updates).eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  const actor = await resolveActor();
  await logOrderEvent({
    orderId,
    actor,
    action: decision === "approve" ? "quote_approved" : "quote_changes_requested",
    detail: note ? { note } : {},
  });

  // No single "the receptionist" — any dashboard user with a manager role
  // (receptionist/supervisor/boss) can work the approval queue, so all of
  // them get notified. Push-only: unlike quoteOrder's client-facing
  // notification, there's no single order-item-owning recipient to hang an
  // in-app notifications row on here.
  const { data: managers } = await admin.from("profiles").select("id").in("role", ["receptionist", "supervisor", "boss"]);
  await Promise.all(
    (managers ?? []).map((m) =>
      notifyActor(
        { type: "dashboard_user", id: m.id },
        {
          title: decision === "approve" ? "Client approved a quote" : "Client requested changes",
          body: `Order ${order.order_no}${decision === "changes_requested" && note ? `: ${note}` : ""}`,
          url: "/dashboard/order-approvals",
        },
      ),
    ),
  );

  revalidatePath("/client-side");
  revalidatePath("/client-side/orders");
  return { ok: true };
}

// Backs the notification bell in the topbar — no page in /client-side
// shares a layout to fetch this server-side once, so ClientNotificationMenu
// calls this itself on mount and again on every Realtime insert.
export async function getMyNotifications(): Promise<NotificationRow[]> {
  const session = await getClientSession();
  if (!session) return [];
  return fetchClientNotifications(session.client_id, 10);
}
