"use server";

import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@repo/lib/supabase/admin";
import { createClient } from "@repo/lib/supabase/server";
import { countAttempt, tooManyAttempts } from "@repo/lib/auth/attempts";
import { signPayload, verifyPayload } from "@repo/lib/auth/cookies";
import { getClientSession } from "@repo/lib/auth/session";
import { logOrderEvent, resolveActor } from "@repo/lib/audit/log";
import {
  exactClientMatch,
  findClientCandidates,
  resolveOrCreateClient,
  type ClientCandidate,
} from "@repo/lib/clients/dedupe";
import { parsePhone } from "@repo/lib/kernel/core/phone";
import { buildAndInsertOrder } from "@repo/lib/orders/create";
import { applyCancellation, cleanReason, loadCancellableOrder } from "@repo/lib/orders/cancel";
import { isPhotobookCategory } from "@repo/lib/orders/photobook";
import type { CreateOrderResult, OrderItemInput } from "@repo/lib/orders/types";
import { projectIdSchema } from "@repo/lib/projects/core";
import { notifyActor } from "@repo/lib/push/send";
import { fetchClientNotifications } from "@repo/lib/queries";
import { LOGO_CID, maskEmail, signInCodeEmail } from "@repo/lib/studio-access/core";
import { resendMailer } from "@repo/lib/studio-access/adapters/resend/mailer";
import { linkPlacedOrder } from "@repo/lib/studio-orders/server";
import type { NotificationRow, OrderType } from "@repo/lib/types";

const NAME_MAX = 100;

type ActionResult = { ok: true } | { ok: false; error: string };

// Clients sign in with a phone number to find the account, then a 6-digit
// code emailed to the address on file. The code is ours — made here, sent
// through Resend, only its HMAC kept — so Supabase never emails anyone and
// its OTP settings don't matter. Once it checks out, Supabase Auth issues the
// standard session (JWT) cookies, refreshed by proxy.ts and read by
// getClientSession through the client_identities link.
//
// The code goes to the email on the account. An older account with no email
// yet adds one here and verifies it with the code.
//
// Between the two steps, who is signing in (and, for a new account, the name
// and phone to create it with) and the code's hash ride in a short-lived
// signed cookie, so the browser can't swap in another account at the code
// step. Wrong guesses are counted server-side per code (auth_attempts), so
// replaying the cookie doesn't reset them.

const LOGIN_COOKIE = "client_login";
const LOGIN_TTL_SECONDS = 10 * 60;

interface PendingLogin {
  email: string;
  phone: string;
  clientId: string | null; // null: create the account once the code checks out
  name: string | null;
  nonce: string;
  codeHash: string;
  exp: number;
}

const CODE_MINUTES = LOGIN_TTL_SECONDS / 60;

function hashCode(nonce: string, email: string, code: string): string {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is not set");
  return createHmac("sha256", secret).update(`client-login:${nonce}:${email}:${code}`).digest("hex");
}

export type StartLoginResult =
  | { ok: true; step: "code"; sentTo: string }
  | { ok: true; step: "new" } // unknown number: ask for name + email
  | { ok: true; step: "add-email" } // known number, no email yet
  | { ok: false; error: string };

// The client, if any, that holds this phone number. The database matches it
// however the record was typed (0703…, +256703…; norm_client_phone).
async function clientByPhone(
  admin: ReturnType<typeof createAdminClient>,
  phone: string,
): Promise<ClientCandidate | null> {
  return exactClientMatch(await findClientCandidates(admin, { phone }));
}

function cleanEmail(input: string | undefined): string | null {
  const email = input?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function emailTakenByOtherClient(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  clientId: string,
): Promise<boolean> {
  const hits = await findClientCandidates(admin, { email, excludeId: clientId });
  return hits.some((c) => c.match_reason === "email");
}

async function sendCode(pending: Omit<PendingLogin, "nonce" | "codeHash" | "exp">): Promise<StartLoginResult> {
  const sendKey = `login-send:${pending.email}`;
  if (await tooManyAttempts(sendKey)) {
    return { ok: false, error: "Too many codes sent to this email. Please wait 15 minutes and try again." };
  }
  await countAttempt(sendKey);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const nonce = randomUUID();
  try {
    await resendMailer.send({
      to: pending.email,
      ...signInCodeEmail({ workspace: "", logo: `cid:${LOGO_CID}` }, code, CODE_MINUTES),
    });
  } catch (err) {
    console.error("client login: sending the code failed:", err);
    return { ok: false, error: "We couldn't send a code to that email. Check it and try again." };
  }

  const payload: PendingLogin = {
    ...pending,
    nonce,
    codeHash: hashCode(nonce, pending.email, code),
    exp: Date.now() + LOGIN_TTL_SECONDS * 1000,
  };
  (await cookies()).set(LOGIN_COOKIE, await signPayload({ ...payload }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LOGIN_TTL_SECONDS,
  });
  return { ok: true, step: "code", sentTo: maskEmail(pending.email) };
}

/** Step 1 (and "resend code"): find the account by phone and email it a code. */
export async function startLogin(input: {
  phone: string;
  name?: string;
  email?: string;
}): Promise<StartLoginResult> {
  const parsed = parsePhone(input.phone);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const admin = createAdminClient();
  const match = await clientByPhone(admin, parsed.store);

  if (match) {
    if (!match.active) return { ok: false, error: "This account is inactive — contact us for help." };
    const onFile = cleanEmail(match.email ?? undefined);
    if (onFile) return sendCode({ email: onFile, phone: parsed.store, clientId: match.id, name: null });

    // An older account with no email yet: ask for one and verify it with the code.
    if (input.email === undefined) return { ok: true, step: "add-email" };
    const email = cleanEmail(input.email);
    if (!email) return { ok: false, error: "Enter a valid email address." };
    if (await emailTakenByOtherClient(admin, email, match.id)) {
      return { ok: false, error: "That email belongs to another account — use a different one." };
    }
    return sendCode({ email, phone: parsed.store, clientId: match.id, name: null });
  }

  // A new number: their full name or studio name, so reception knows who
  // they're dealing with. At least two letters, so a number or "." won't do.
  if (input.name === undefined) return { ok: true, step: "new" };
  const name = input.name.trim().replace(/\s+/g, " ");
  if ((name.match(/\p{L}/gu)?.length ?? 0) < 2) {
    return { ok: false, error: "Enter your full name or business name." };
  }
  if (name.length > NAME_MAX) return { ok: false, error: `Name must be ${NAME_MAX} characters or fewer.` };
  const email = cleanEmail(input.email);
  if (!email) return { ok: false, error: "Enter a valid email address." };
  return sendCode({ email, phone: parsed.store, clientId: null, name });
}

/** Step 2: check the emailed code, then tie the signed-in auth user to the client. */
export async function verifyLoginCode(code: string): Promise<ActionResult> {
  const store = await cookies();
  const pending = await verifyPayload<PendingLogin>(store.get(LOGIN_COOKIE)?.value);
  if (!pending || pending.exp < Date.now()) {
    return { ok: false, error: "That sign-in has expired — enter your phone number again." };
  }

  const codeKey = `login-code:${pending.nonce}`;
  const tooMany = "Too many wrong codes. Ask for a new one.";
  if (await tooManyAttempts(codeKey)) return { ok: false, error: tooMany };
  const given = Buffer.from(hashCode(pending.nonce, pending.email, code.replace(/\s/g, "")));
  const expected = Buffer.from(pending.codeHash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, error: (await countAttempt(codeKey)) ? tooMany : "That code is wrong. Check the email and try again." };
  }
  store.delete(LOGIN_COOKIE);

  // The code checked out: have Supabase Auth issue the session. The auth
  // user is created on first sign-in (already confirmed); generateLink makes
  // a one-time token without sending any email, redeemed right here.
  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({ email: pending.email, email_confirm: true });
  if (createError && createError.code !== "email_exists") {
    console.error("client login: createUser failed:", createError);
    return { ok: false, error: "We couldn't sign you in. Please try again." };
  }
  const { data: link, error: linkGenError } = await admin.auth.admin.generateLink({ type: "magiclink", email: pending.email });
  if (linkGenError) {
    console.error("client login: generateLink failed:", linkGenError);
    return { ok: false, error: "We couldn't sign you in. Please try again." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (error || !data.user) {
    console.error("client login: verifyOtp failed:", error);
    return { ok: false, error: "We couldn't sign you in. Please try again." };
  }

  let clientId = pending.clientId;
  if (clientId) {
    // An older account adding its first email (verified by the code).
    const { data: claimed, error: emailError } = await admin
      .from("clients")
      .update({ email: pending.email })
      .eq("id", clientId)
      .is("email", null)
      .select("name, phone")
      .maybeSingle();
    if (emailError) {
      await supabase.auth.signOut();
      return { ok: false, error: "That email belongs to another account — use a different one." };
    }
    // Anyone who knows the phone number can do this once, before the owner
    // does — so reception hears about every first email and can catch a
    // wrong one (fix the email in Clients, which moves the sign-in with it).
    if (claimed) {
      const { data: managers } = await admin.from("profiles").select("id").in("role", ["receptionist", "supervisor", "boss"]);
      await Promise.all(
        (managers ?? []).map((m) =>
          notifyActor(
            { type: "dashboard_user", id: m.id },
            {
              title: "Client added a sign-in email",
              body: `${claimed.name}${claimed.phone ? ` (${claimed.phone})` : ""} now signs in with ${pending.email}. Not them? Fix the email in Clients.`,
              url: "/dashboard/clients",
            },
          ),
        ),
      );
    }
  } else {
    const resolved = await resolveOrCreateClient(admin, {
      name: pending.name,
      phone: pending.phone,
      email: pending.email,
    });
    if (!resolved.ok) {
      await supabase.auth.signOut();
      return { ok: false, error: resolved.error };
    }
    clientId = resolved.client.id;
  }

  // One auth user per client: a new email for the client (changed by
  // reception) replaces the old link rather than failing on client_id.
  await admin.from("client_identities").delete().eq("client_id", clientId).neq("auth_user_id", data.user.id);
  const { error: linkError } = await admin
    .from("client_identities")
    .upsert({ auth_user_id: data.user.id, client_id: clientId }, { onConflict: "auth_user_id" });
  if (linkError) {
    console.error("client login: linking identity failed:", linkError);
    await supabase.auth.signOut();
    return { ok: false, error: "We couldn't sign you in. Please try again." };
  }

  return { ok: true };
}

export async function logoutClient(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export interface ClientOrderPayload {
  order_type: OrderType;
  delivery_date: string;
  order_notes: string;
  items: OrderItemInput[];
  /** A studio project this order is for (My Studio → project → "Order from Aming"). */
  project_id?: string | null;
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

  // Ordered for one of the client's studio projects: link it there. The order
  // stands either way; a failed link only comes back as a warning.
  const warnings: string[] = [];
  const project = input.project_id ? projectIdSchema.safeParse(input.project_id) : null;
  if (project?.success) {
    const problem = await linkPlacedOrder(project.data, res.orderId);
    if (problem) warnings.push(problem);
  }

  revalidatePath("/");
  revalidatePath("/history");
  return { ...res, warnings };
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

  revalidatePath("/");
  revalidatePath("/orders");
  return { ok: true };
}

// Backs the notification bell in the topbar — no page in /
// shares a layout to fetch this server-side once, so ClientNotificationMenu
// calls this itself on mount and again on every Realtime insert.
export async function getMyNotifications(): Promise<NotificationRow[]> {
  const session = await getClientSession();
  if (!session) return [];
  return fetchClientNotifications(session.client_id, 10);
}

// A client can cancel their own order only while it's still unconfirmed —
// once the receptionist has confirmed it and sent it on (released_at set),
// work may have started, so only the boss can cancel it from then on (see
// cancelOrder in app/dashboard/actions.ts). Staff get told either way.
export async function cancelMyOrder(orderId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getClientSession();
  if (!session) return { ok: false, error: "Not signed in." };
  const why = cleanReason(reason);
  if (!why) return { ok: false, error: "Please tell us why you're cancelling." };

  const { order, items } = await loadCancellableOrder(orderId);
  // Ownership check is load-bearing — see respondToQuote above.
  if (!order || order.client_id !== session.client_id) return { ok: false, error: "Order not found." };
  if (order.cancelled_at) return { ok: false, error: "This order is already cancelled." };
  if (order.released_at) {
    return {
      ok: false,
      error: "This order has already been confirmed and is being worked on. Please contact us to cancel it.",
    };
  }

  const actor = await resolveActor();
  if (!actor) return { ok: false, error: "Not signed in." };
  const res = await applyCancellation({ order, items, reason: why, actor, notifyClient: false });
  if (!res.ok) return res;

  const admin = createAdminClient();
  const { data: managers } = await admin.from("profiles").select("id").in("role", ["receptionist", "supervisor", "boss"]);
  await Promise.all(
    (managers ?? []).map((m) =>
      notifyActor(
        { type: "dashboard_user", id: m.id },
        {
          title: "Client cancelled an order",
          body: `Order ${order.order_no} from ${session.name}: "${why}"`,
          url: "/dashboard/order-approvals",
        },
      ),
    ),
  );
  return { ok: true };
}
