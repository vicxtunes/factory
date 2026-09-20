"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { getClientSession, getGoogleIdentity } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { verifyPin } from "@/lib/auth/pin";
import { clearAttempts, isBlocked, recordFailure, TOO_MANY_ATTEMPTS } from "@/lib/auth/attempts";
import { logOrderEvent, resolveActor } from "@/lib/audit/log";
import { exactClientMatch, findClientCandidates, resolveOrCreateClient } from "@/lib/clients/dedupe";
import { buildAndInsertOrder } from "@/lib/orders/create";
import type { CreateOrderResult, OrderItemInput } from "@/lib/orders/types";
import { notifyActor } from "@/lib/push/send";
import { fetchClientNotifications } from "@/lib/queries";
import type { NotificationRow, OrderType } from "@/lib/types";

type ActionResult = { ok: true } | { ok: false; error: string };

// Clients sign in with Google only — no phone-only login, no client PINs. A
// signed-in Google user then links to (or creates) their client record by
// phone number; see linkGoogleAccount below.

// After Google, the setup form asks for a phone number and uses this to tell
// "known number" from "new number". Requires a Google sign-in so it can't be
// used by anonymous callers to probe which phone numbers are clients.
export async function checkAccount(phone: string): Promise<{ exists: boolean }> {
  if (!phone.trim()) return { exists: false };
  const google = await getGoogleIdentity();
  if (!google) return { exists: false };

  const admin = createAdminClient();
  const match = exactClientMatch(await findClientCandidates(admin, { phone }));
  return { exists: !!match && match.active };
}

export async function logoutClient(): Promise<void> {
  // Guarded so a dashboard staff member's session isn't signed out from here.
  if (await getGoogleIdentity()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
}

// --- Continue with Google ---------------------------------------------------
// Google proves who the person is; it doesn't tell us which client row is
// theirs. After the OAuth round trip we ask for a phone number and either
// link the Google account to the existing client that owns it (keeping their
// orders, history and notifications — nothing is recreated) or, if the number
// is new, create the client. The link lives in client_identities.

export async function linkGoogleAccount(input: {
  phone: string;
  name?: string;
  pin?: string;
}): Promise<ActionResult> {
  const google = await getGoogleIdentity();
  if (!google) return { ok: false, error: "Please sign in with Google first." };
  if (!input.phone.trim()) return { ok: false, error: "Phone number is required." };

  const admin = createAdminClient();

  // Already linked (e.g. a double submit): nothing to do. Never re-point an
  // existing link at a different client.
  const { data: existingLink } = await admin
    .from("client_identities")
    .select("client_id")
    .eq("auth_user_id", google.userId)
    .maybeSingle();
  if (existingLink) return { ok: true };

  // Linking is the one place a phone number is claimed, so throttle it per
  // Google account (Google accounts are free — this only slows enumeration).
  const throttle = [`client-link:${google.userId}`];
  if (await isBlocked(throttle)) return { ok: false, error: TOO_MANY_ATTEMPTS };

  const match = exactClientMatch(await findClientCandidates(admin, { phone: input.phone }));

  let clientId: string;

  if (match) {
    if (!match.active) return { ok: false, error: "This account is inactive — contact us for help." };

    const { data: taken } = await admin
      .from("client_identities")
      .select("auth_user_id")
      .eq("client_id", match.id)
      .maybeSingle();
    if (taken && taken.auth_user_id !== google.userId) {
      return { ok: false, error: "This number is already connected to another Google account — contact us for help." };
    }

    // A Google-verified email that already matches the one on file is proof
    // enough. Otherwise, a client who set a PIN back when PINs existed must
    // still supply it — that legacy PIN is what stops someone typing their
    // number to take over their account. (No new PINs can be created.)
    const emailVerified =
      !!google.email && !!match.email && match.email.trim().toLowerCase() === google.email.toLowerCase();
    if (!emailVerified) {
      const { data: cred } = await admin
        .from("client_credentials")
        .select("pin_hash")
        .eq("client_id", match.id)
        .maybeSingle();
      if (cred) {
        if (!input.pin) return { ok: false, error: "PIN required." };
        if (!(await verifyPin(input.pin, cred.pin_hash))) {
          await recordFailure(throttle);
          return { ok: false, error: "Incorrect PIN." };
        }
      }
    }

    clientId = match.id;
    if (!match.email && google.email) {
      await admin.from("clients").update({ email: google.email }).eq("id", match.id);
    }
  } else {
    const name = input.name?.trim() || google.name?.trim() || "";
    if (!name) return { ok: false, error: "Name is required." };
    const resolved = await resolveOrCreateClient(admin, {
      name,
      phone: input.phone,
      email: google.email,
    });
    if (!resolved.ok) return { ok: false, error: resolved.error };
    clientId = resolved.client.id;
  }

  const { error } = await admin
    .from("client_identities")
    .insert({ auth_user_id: google.userId, client_id: clientId });
  if (error) {
    // 23505 = that client is already linked to a different Google account
    // (created between the check above and now).
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: "This number is already connected to another Google account — contact us for help." };
    }
    return { ok: false, error: error.message };
  }

  await clearAttempts(throttle);
  revalidatePath("/client-side");
  return { ok: true };
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
    // Goes to the receptionist's quote queue first, not straight to the
    // factory board — see quoteOrder/routeApprovedOrder in
    // app/dashboard/actions.ts.
    releaseImmediately: false,
  });

  if (!res.ok) return res;

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
