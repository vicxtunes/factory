import { cookies } from "next/headers";

import { ContinueForm } from "./continue-form";
import { SIGNUP_EMAIL_COOKIE } from "./landing-signup";
import { rememberedClient } from "./remembered-device";

/** signup: open on Create an account, with the email from the front page's sign-up box. */
export async function AuthGate({ signup = false }: { signup?: boolean }) {
  const remembered = await rememberedClient();
  const opening = signup ? { signup: (await cookies()).get(SIGNUP_EMAIL_COOKIE)?.value ?? "" } : undefined;
  return (
    <div className="w-full rounded-2xl border border-border bg-surface p-6 shadow-theme-lg">
      <ContinueForm remembered={remembered && { name: remembered.name, avatarUrl: remembered.avatarUrl, unlockWith: remembered.unlockWith }} opening={opening} />
    </div>
  );
}
