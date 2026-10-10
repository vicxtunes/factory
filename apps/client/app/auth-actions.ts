"use server";

import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient as createStatelessClient } from "@supabase/supabase-js";

import { createAdminClient } from "@repo/lib/supabase/admin";
import { createClient } from "@repo/lib/supabase/server";
import { countAttempt, tooManyAttempts } from "@repo/lib/auth/attempts";
import { signPayload, verifyPayload } from "@repo/lib/auth/cookies";
import {
  exactClientMatch,
  findClientCandidates,
  resolveOrCreateClient,
  type ClientCandidate,
} from "@repo/lib/clients/dedupe";
import { parsePhone } from "@repo/lib/kernel/core/phone";
import { notifyActor } from "@repo/lib/push/send";
import { LOGO_CID, maskEmail, signInCodeEmail } from "@repo/lib/studio-access/core";
import { resendMailer } from "@repo/lib/studio-access/adapters/resend/mailer";

// Client sign-in (clients, studio owners and their team members alike):
//
//   Sign in          email or phone + password  → code to the email on file → in
//   Create account   name, email, phone          → code → choose a password  → in
//   Forgot password  email or phone              → code → new password       → in
//
// "Forgot password" is also how an older account (phone only, no password)
// sets its first one; with no email on file it adds one, verified by the code.
//
// Studio owners sign in with their studio's email: the one they verified when
// setting up the studio (tenants.owner_email) finds the owner's account just
// like the account's own email. The code then goes to the email they typed;
// the password and session stay on the account's sign-in.
//
// Passwords live in Supabase Auth. The 6-digit code is ours — made here, sent
// through Resend (code only, no link), only its HMAC kept — so Supabase never
// emails anyone. Once a flow completes, Supabase Auth issues the standard
// session (JWT) cookies, refreshed by proxy.ts and read by getClientSession
// through the client_identities link.
//
// Between steps, the flow (who, which email, the code's hash, whether the
// code was checked) rides in a short-lived signed cookie, so the browser
// can't swap in another account. Wrong passwords, wrong codes and codes sent
// are counted server-side (auth_attempts), so replaying the cookie doesn't
// reset them.

type ActionResult = { ok: true } | { ok: false; error: string };
type Method = "email" | "phone";
type Purpose = "signin" | "signup" | "reset";

export type AuthStep =
  | { ok: true; step: "code"; sentTo: string }
  | { ok: true; step: "add-email" } // forgot password by phone, and the account has no email yet
  | { ok: true; step: "password" } // code checked: choose a password
  | { ok: true; step: "done" }
  | { ok: false; error: string };

const FLOW_COOKIE = "client_login";
const FLOW_TTL_SECONDS = 10 * 60;
const CODE_MINUTES = FLOW_TTL_SECONDS / 60;
const NAME_MAX = 100;
const PASSWORD_MIN = 8;
/** bcrypt (Supabase Auth's hash) reads only the first 72 bytes. */
const PASSWORD_MAX = 72;
const TRY_AGAIN = "We couldn't sign you in. Please try again.";

interface Flow {
  purpose: Purpose;
  email: string;
  phone: string | null;
  clientId: string | null; // null: create the account at the end (sign up)
  name: string | null;
  /** Where the code went, when not `email` (a studio owner who typed their studio email). */
  sendTo?: string | null;
  nonce: string;
  codeHash: string;
  verified: boolean; // the code checked out; waiting for the password
  exp: number;
}

// --- Helpers ----------------------------------------------------------------

function hashCode(nonce: string, email: string, code: string): string {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is not set");
  return createHmac("sha256", secret).update(`client-login:${nonce}:${email}:${code}`).digest("hex");
}

function cleanEmail(input: string | null | undefined): string | null {
  const email = input?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The client an email or phone number belongs to. The database matches a
 * phone however it was typed. An email is the account's own, or a studio's
 * verified owner email (`studioEmail`: the code goes there).
 */
async function findClient(
  admin: Admin,
  method: Method,
  identifier: string,
): Promise<{ client: ClientCandidate; studioEmail: string | null } | null> {
  if (method === "phone") {
    const parsed = parsePhone(identifier);
    if (!parsed.ok) return null;
    const client = exactClientMatch(await findClientCandidates(admin, { phone: parsed.store }));
    return client && { client, studioEmail: null };
  }
  const email = cleanEmail(identifier);
  if (!email) return null;
  const own = (await findClientCandidates(admin, { email })).find((c) => c.match_reason === "email");
  if (own) return { client: own, studioEmail: null };

  const { data: studio } = await admin
    .from("tenants")
    .select("owner:clients (id, name, email, phone, active)")
    .eq("owner_email", email)
    .not("owner_email_verified_at", "is", null)
    .limit(1)
    .maybeSingle<{ owner: Omit<ClientCandidate, "match_reason" | "score"> | null }>();
  if (!studio?.owner) return null;
  return { client: { ...studio.owner, match_reason: "email", score: 1 }, studioEmail: email };
}

async function emailTakenByOtherClient(admin: Admin, email: string, clientId: string | null): Promise<boolean> {
  const hits = await findClientCandidates(admin, { email, excludeId: clientId });
  return hits.some((c) => c.match_reason === "email");
}

async function saveFlow(flow: Flow): Promise<void> {
  (await cookies()).set(FLOW_COOKIE, await signPayload({ ...flow }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(1, Math.round((flow.exp - Date.now()) / 1000)),
  });
}

async function currentFlow(): Promise<Flow | null> {
  const flow = await verifyPayload<Flow>((await cookies()).get(FLOW_COOKIE)?.value);
  return flow && flow.exp > Date.now() ? flow : null;
}

/** Emails a fresh code and starts the flow. */
async function sendCode(flow: Pick<Flow, "purpose" | "email" | "phone" | "clientId" | "name" | "sendTo">): Promise<AuthStep> {
  const to = flow.sendTo ?? flow.email;
  const sendKey = `login-send:${to}`;
  if (await tooManyAttempts(sendKey)) {
    return { ok: false, error: "Too many codes sent to this email. Please wait 15 minutes and try again." };
  }
  await countAttempt(sendKey);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const nonce = randomUUID();
  try {
    await resendMailer.send({
      to,
      ...signInCodeEmail({ workspace: "", logo: `cid:${LOGO_CID}` }, code, CODE_MINUTES),
    });
  } catch (err) {
    console.error("client login: sending the code failed:", err);
    return { ok: false, error: "We couldn't send a code to that email. Check it and try again." };
  }

  await saveFlow({
    ...flow,
    nonce,
    codeHash: hashCode(nonce, flow.email, code),
    verified: false,
    exp: Date.now() + FLOW_TTL_SECONDS * 1000,
  });
  return { ok: true, step: "code", sentTo: maskEmail(to) };
}

/**
 * Whether the password is right for this email. Checked with a throwaway,
 * cookie-less client; the session Supabase makes is revoked at once (that one
 * only: the default scope would sign them out on every other device) — the
 * real one comes only after the emailed code.
 */
async function passwordMatches(email: string, password: string): Promise<boolean> {
  const supabase = createStatelessClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return false;
  await createAdminClient().auth.admin.signOut(data.session.access_token, "local");
  return true;
}

/** Signs this browser in as the auth user with this email (Supabase sends nothing). Returns its id. */
async function openSession(email: string): Promise<string | null> {
  const { data: link, error: linkError } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (linkError) {
    console.error("client login: generateLink failed:", linkError);
    return null;
  }
  const { data, error } = await (await createClient()).auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (error || !data.user) {
    console.error("client login: verifyOtp failed:", error);
    return null;
  }
  return data.user.id;
}

/**
 * Creates the auth user with this password, or sets the password on the
 * existing one. Returns what to tell the person when it fails, else null.
 */
async function setAuthPassword(email: string, password: string): Promise<string | null> {
  const admin = createAdminClient();
  const failed = (step: string, error: { code?: string; message: string }) => {
    // Supabase's own password rules (Auth → Policies) — its message says what to fix.
    if (error.code === "weak_password") return error.message;
    console.error(`client login: ${step} failed:`, error);
    return TRY_AGAIN;
  };
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!created.error) return null;
  if (created.error.code !== "email_exists") return failed("createUser", created.error);
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) return failed("finding the auth user", error);
  const updated = await admin.auth.admin.updateUserById(link.user.id, { password });
  return updated.error ? failed("setting the password", updated.error) : null;
}

/** One auth user per client: a new email for the client (changed by reception) replaces the old link. */
async function linkClient(admin: Admin, clientId: string, authUserId: string): Promise<boolean> {
  await admin.from("client_identities").delete().eq("client_id", clientId).neq("auth_user_id", authUserId);
  const { error } = await admin
    .from("client_identities")
    .upsert({ auth_user_id: authUserId, client_id: clientId }, { onConflict: "auth_user_id" });
  if (error) console.error("client login: linking identity failed:", error);
  return !error;
}

/**
 * An older account adding its first email (verified by the code). Anyone who
 * knows the phone number can do this once, before the owner does — so
 * reception hears about every first email and can catch a wrong one (fixing
 * the email in Clients signs out whoever held the old one).
 */
async function claimFirstEmail(admin: Admin, clientId: string, email: string): Promise<ActionResult> {
  const { data: claimed, error } = await admin
    .from("clients")
    .update({ email })
    .eq("id", clientId)
    .is("email", null)
    .select("name, phone")
    .maybeSingle();
  if (error) return { ok: false, error: "That email belongs to another account — use a different one." };
  if (claimed) {
    const { data: managers } = await admin.from("profiles").select("id").in("role", ["receptionist", "supervisor", "boss"]);
    await Promise.all(
      (managers ?? []).map((m) =>
        notifyActor(
          { type: "dashboard_user", id: m.id },
          {
            title: "Client added a sign-in email",
            body: `${claimed.name}${claimed.phone ? ` (${claimed.phone})` : ""} now signs in with ${email}. Not them? Fix the email in Clients.`,
            url: "/dashboard/clients",
          },
        ),
      ),
    );
  }
  return { ok: true };
}

/** The email the signed-in client signs in with (their Supabase Auth account), for the profile. */
export async function mySignInEmail(): Promise<string | null> {
  const { data } = await (await createClient()).auth.getClaims();
  return typeof data?.claims?.email === "string" ? data.claims.email : null;
}

// --- Step 1: start a flow ------------------------------------------------------

/** Sign in: email or phone and password; a right password emails the code. */
export async function signIn(input: { method: Method; identifier: string; password: string }): Promise<AuthStep> {
  const wrong = `That ${input.method === "phone" ? "phone number" : "email"} and password don't match.`;
  const admin = createAdminClient();
  const found = await findClient(admin, input.method, input.identifier);
  const client = found?.client;
  const email = cleanEmail(client?.email);
  if (!found || !client || !email) return { ok: false, error: wrong };
  if (!client.active) return { ok: false, error: "This account is inactive — contact us for help." };

  const key = `login-pw:${client.id}`;
  if (await tooManyAttempts(key)) return { ok: false, error: "Too many wrong passwords. Wait 15 minutes, or reset your password." };
  if (!input.password || input.password.length > PASSWORD_MAX || !(await passwordMatches(email, input.password))) {
    await countAttempt(key);
    return { ok: false, error: wrong };
  }
  return sendCode({ purpose: "signin", email, phone: client.phone, clientId: client.id, name: null, sendTo: found.studioEmail });
}

/** Create account: name, email and phone; the code verifies the email, then they choose a password. */
export async function startSignUp(input: { name: string; email: string; phone: string }): Promise<AuthStep> {
  // Their full name or studio name, so reception knows who they're dealing
  // with. At least two letters, so a number or "." won't do.
  const name = input.name.trim().replace(/\s+/g, " ");
  if ((name.match(/\p{L}/gu)?.length ?? 0) < 2) return { ok: false, error: "Enter your full name or business name." };
  if (name.length > NAME_MAX) return { ok: false, error: `Name must be ${NAME_MAX} characters or fewer.` };
  const email = cleanEmail(input.email);
  if (!email) return { ok: false, error: "Enter a valid email address." };
  const phone = parsePhone(input.phone);
  if (!phone.ok) return { ok: false, error: phone.error };

  const admin = createAdminClient();
  if ((await findClient(admin, "phone", phone.store)) || (await findClient(admin, "email", email))) {
    return { ok: false, error: "There's already an account with that phone number or email. Sign in, or reset your password." };
  }
  return sendCode({ purpose: "signup", email, phone: phone.store, clientId: null, name });
}

/**
 * Forgot password (and an older account's first password): the code goes to
 * the email on file. An account with no email yet adds one (`email`).
 */
export async function startReset(input: { method: Method; identifier: string; email?: string }): Promise<AuthStep> {
  const admin = createAdminClient();
  const found = await findClient(admin, input.method, input.identifier);
  const client = found?.client;
  if (!found || !client) return { ok: false, error: `We couldn't find an account with that ${input.method === "phone" ? "phone number" : "email"}.` };
  if (!client.active) return { ok: false, error: "This account is inactive — contact us for help." };

  const onFile = cleanEmail(client.email);
  if (onFile) return sendCode({ purpose: "reset", email: onFile, phone: client.phone, clientId: client.id, name: null, sendTo: found.studioEmail });
  // A studio owner whose account has no email yet: their verified studio email becomes it.
  if (found.studioEmail) return sendCode({ purpose: "reset", email: found.studioEmail, phone: client.phone, clientId: client.id, name: null });

  if (input.email === undefined) return { ok: true, step: "add-email" };
  const email = cleanEmail(input.email);
  if (!email) return { ok: false, error: "Enter a valid email address." };
  if (await emailTakenByOtherClient(admin, email, client.id)) {
    return { ok: false, error: "That email belongs to another account — use a different one." };
  }
  return sendCode({ purpose: "reset", email, phone: client.phone, clientId: client.id, name: null });
}

// --- Step 2: the emailed code ---------------------------------------------------

/** Checks the code. Signing in finishes here; sign up and reset go on to choose a password. */
export async function verifyCode(code: string): Promise<AuthStep> {
  const flow = await currentFlow();
  if (!flow || flow.verified) return { ok: false, error: "That code has expired — start again." };

  const codeKey = `login-code:${flow.nonce}`;
  const tooMany = "Too many wrong codes. Ask for a new one.";
  if (await tooManyAttempts(codeKey)) return { ok: false, error: tooMany };
  const given = Buffer.from(hashCode(flow.nonce, flow.email, code.replace(/\s/g, "")));
  const expected = Buffer.from(flow.codeHash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, error: (await countAttempt(codeKey)) ? tooMany : "That code is wrong. Check the email and try again." };
  }

  if (flow.purpose !== "signin") {
    await saveFlow({ ...flow, verified: true });
    return { ok: true, step: "password" };
  }

  (await cookies()).delete(FLOW_COOKIE);
  const authUserId = await openSession(flow.email);
  if (!authUserId || !(await linkClient(createAdminClient(), flow.clientId!, authUserId))) {
    await (await createClient()).auth.signOut({ scope: "local" });
    return { ok: false, error: TRY_AGAIN };
  }
  return { ok: true, step: "done" };
}

// --- Step 3 (sign up, reset): the password ------------------------------------------

/** Sets the password, creates the account (sign up) or saves its first email (reset), and signs in. */
export async function choosePassword(input: { password: string; confirm: string }): Promise<AuthStep> {
  const flow = await currentFlow();
  if (!flow?.verified) return { ok: false, error: "That sign-in has expired — start again." };
  if (input.password.length < PASSWORD_MIN) return { ok: false, error: `Use at least ${PASSWORD_MIN} characters.` };
  if (input.password.length > PASSWORD_MAX) return { ok: false, error: `Keep the password under ${PASSWORD_MAX} characters.` };
  if (input.password !== input.confirm) return { ok: false, error: "The two passwords don't match." };

  // The password first: if Supabase refuses it, nothing else has changed yet.
  const passwordError = await setAuthPassword(flow.email, input.password);
  if (passwordError) return { ok: false, error: passwordError };

  const admin = createAdminClient();
  let clientId = flow.clientId;
  if (clientId) {
    const claimed = await claimFirstEmail(admin, clientId, flow.email);
    if (!claimed.ok) return claimed;
  } else {
    const resolved = await resolveOrCreateClient(admin, { name: flow.name, phone: flow.phone, email: flow.email });
    if (!resolved.ok) return resolved;
    clientId = resolved.client.id;
  }

  (await cookies()).delete(FLOW_COOKIE);
  const authUserId = await openSession(flow.email);
  if (!authUserId || !(await linkClient(admin, clientId, authUserId))) {
    await (await createClient()).auth.signOut({ scope: "local" });
    return { ok: false, error: TRY_AGAIN };
  }
  return { ok: true, step: "done" };
}
