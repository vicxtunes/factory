import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// The front page's sign-up box, like GitHub's: an email and one button. The
// email waits in a short-lived cookie (not the address bar) and the sign-up
// form opens with it filled in (auth-gate.tsx reads it back).

export const SIGNUP_EMAIL_COOKIE = "aming-signup-email";

async function startSignUp(form: FormData) {
  "use server";
  const email = String(form.get("email") ?? "").trim().slice(0, 254);
  (await cookies()).set(SIGNUP_EMAIL_COOKIE, email, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  redirect("/?signin=new");
}

export function LandingSignup({ id }: { id: string }) {
  return (
    <form action={startSignUp} className="flex w-full max-w-xl flex-col gap-3 sm:flex-row">
      <label htmlFor={id} className="sr-only">
        Email
      </label>
      <input
        id={id}
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="Enter your email"
        className="h-12 w-full min-w-0 rounded-[var(--radius)] border border-border bg-surface px-4 text-base text-foreground placeholder:text-muted outline-none sm:flex-1 focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
      />
      <button type="submit" className="h-12 shrink-0 rounded-[var(--radius)] bg-brand-500 px-6 font-semibold text-white shadow-theme-xs transition-colors hover:bg-brand-600">
        Open your business
      </button>
    </form>
  );
}
