import Link from "next/link";

import { AutoRedirect } from "@repo/ui/AutoRedirect";
import { Button } from "@repo/ui/Button";
import { Header } from "@repo/ui/Header";
import { getClientSession } from "@repo/lib/auth/session";

export const metadata = { title: "Page not found" };

// Signed-in clients go back to their orders, everyone else to the showroom
// (the portal's front door, served at /).
async function homeFor(): Promise<{ href: string; label: string }> {
  try {
    if (await getClientSession()) return { href: "/", label: "Back to your orders" };
  } catch {
    // Session lookup must never break the 404 page itself.
  }
  return { href: "/", label: "Back to the showroom" };
}

export default async function NotFound() {
  const home = await homeFor();

  return (
    <>
      <Header surface="Page not found" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <p className="text-7xl font-extrabold tracking-tight text-brand-500">404</p>
        <h1 className="text-xl font-semibold">We can&apos;t find that page</h1>
        <p className="text-sm text-muted">
          The link may be old or mistyped. Let&apos;s get you back to where you were headed.
        </p>
        <Link href={home.href}>
          <Button variant="primary" className="mt-2">
            {home.label}
          </Button>
        </Link>
        <AutoRedirect to={home.href} />
      </main>
    </>
  );
}
