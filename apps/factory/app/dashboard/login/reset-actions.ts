"use server";

import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { createAdminClient } from "@repo/lib/supabase/admin";
import { createClient } from "@repo/lib/supabase/server";
import { countAttempt, tooManyAttempts } from "@repo/lib/auth/attempts";
import { signPayload, verifyPayload } from "@repo/lib/auth/cookies";
import { LOGO_CID, signInCodeEmail } from "@repo/lib/studio-access/core";
import { resendMailer } from "@repo/lib/studio-access/adapters/resend/mailer";

// Forgot password on the dashboard sign-in:
//
//   email → 6-digit code to that email → new password → signed in
//
// Same shape as the client app's (apps/client/app/auth-actions.ts): the code
// is ours, sent through Resend, only its HMAC kept; the flow rides in a
// short-lived signed cookie between steps; codes sent and wrong guesses are
// counted server-side (auth_attempts).
//
// Only dashboard users (an auth user with a profiles row) get a code. Any
// other email is answered the same way and simply never receives one, so the
// form doesn't say which emails are staff.

type ActionResult = { ok: true } | { ok: false; error: string };

const FLOW_COOKIE = "dashboard_reset";
const FLOW_TTL_SECONDS = 10 * 60;
const PASSWORD_MIN = 8;
/** bcrypt (Supabase Auth's hash) reads only the first 72 bytes. */
const PASSWORD_MAX = 72;
const EXPIRED = "That code has expired — start again.";

interface Flow {
  email: string;
  userId: string | null; // null: not a dashboard user, so no code was sent
  nonce: string;
  codeHash: string;
  verified: boolean; // the code checked out; waiting for the password
  exp: number;
}

function hashCode(nonce: string, email: string, code: string): string {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is not set");
  return createHmac("sha256", secret).update(`dashboard-reset:${nonce}:${email}:${code}`).digest("hex");
}

/** The dashboard user with this email. Clients share Supabase Auth, so staff are found through profiles. */
async function dashboardUserId(email: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: profiles } = await admin.from("profiles").select("id");
  const users = await Promise.all((profiles ?? []).map((p) => admin.auth.admin.getUserById(p.id)));
  return users.find((u) => u.data.user?.email?.toLowerCase() === email)?.data.user?.id ?? null;
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

/** Step 1: emails a code to this address if it's a dashboard user's. */
export async function startPasswordReset(emailInput: string): Promise<ActionResult> {
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };

  const sendKey = `reset-send:${email}`;
  if (await tooManyAttempts(sendKey)) {
    return { ok: false, error: "Too many codes sent to this email. Please wait 15 minutes and try again." };
  }
  await countAttempt(sendKey);

  const userId = await dashboardUserId(email);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const nonce = randomUUID();
  if (userId) {
    try {
      await resendMailer.send({
        to: email,
        ...signInCodeEmail({ workspace: "", logo: `cid:${LOGO_CID}` }, code, FLOW_TTL_SECONDS / 60),
      });
    } catch (err) {
      console.error("dashboard reset: sending the code failed:", err);
      return { ok: false, error: "We couldn't send the code. Please try again." };
    }
  }

  await saveFlow({
    email,
    userId,
    nonce,
    codeHash: hashCode(nonce, email, code),
    verified: false,
    exp: Date.now() + FLOW_TTL_SECONDS * 1000,
  });
  return { ok: true };
}

/** Step 2: checks the emailed code. */
export async function verifyResetCode(code: string): Promise<ActionResult> {
  const flow = await currentFlow();
  if (!flow || flow.verified) return { ok: false, error: EXPIRED };

  const codeKey = `reset-code:${flow.nonce}`;
  const tooMany = "Too many wrong codes. Ask for a new one.";
  if (await tooManyAttempts(codeKey)) return { ok: false, error: tooMany };
  const given = Buffer.from(hashCode(flow.nonce, flow.email, code.replace(/\s/g, "")));
  const expected = Buffer.from(flow.codeHash);
  if (!flow.userId || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, error: (await countAttempt(codeKey)) ? tooMany : "That code is wrong. Check the email and try again." };
  }

  await saveFlow({ ...flow, verified: true });
  return { ok: true };
}

/** Step 3: sets the new password and signs in. */
export async function chooseNewPassword(input: { password: string; confirm: string }): Promise<ActionResult> {
  const flow = await currentFlow();
  if (!flow?.verified || !flow.userId) return { ok: false, error: EXPIRED };
  if (input.password.length < PASSWORD_MIN) return { ok: false, error: `Use at least ${PASSWORD_MIN} characters.` };
  if (input.password.length > PASSWORD_MAX) return { ok: false, error: `Keep the password under ${PASSWORD_MAX} characters.` };
  if (input.password !== input.confirm) return { ok: false, error: "The two passwords don't match." };

  const { error } = await createAdminClient().auth.admin.updateUserById(flow.userId, { password: input.password });
  if (error) {
    // Supabase's own password rules (Auth → Policies) — its message says what to fix.
    if (error.code === "weak_password") return { ok: false, error: error.message };
    console.error("dashboard reset: setting the password failed:", error);
    return { ok: false, error: "We couldn't save the password. Please try again." };
  }

  (await cookies()).delete(FLOW_COOKIE);
  const supabase = await createClient();
  const signedIn = await supabase.auth.signInWithPassword({ email: flow.email, password: input.password });
  if (signedIn.error) {
    console.error("dashboard reset: signing in failed:", signedIn.error);
    return { ok: false, error: "Your password is changed. Go back and sign in with it." };
  }
  // Whoever was signed in with the old password, on any other device, is out.
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true };
}
