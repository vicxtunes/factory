import { headers } from "next/headers";
import Link from "next/link";

import { Header } from "@/components/ui/Header";
import { AutoRedirect } from "@/components/ui/AutoRedirect";
import { Button } from "@/components/ui/Button";
import {
  getClientSession,
  getDashboardSession,
  getDesignerSession,
  getWorkerSession,
} from "@/lib/auth/session";

export const metadata = { title: "Page not found — AMING" };

// Where this visitor belongs: the client site's own home on client.*, otherwise
// the surface their session says they work in, otherwise the front page.
async function homeFor(): Promise<{ href: string; label: string }> {
  const host = (await headers()).get("host") ?? "";
  if (/^client\./i.test(host)) return { href: "/", label: "Back to the showroom" };

  try {
    if (await getDashboardSession()) return { href: "/dashboard", label: "Back to the dashboard" };
    if (await getWorkerSession()) return { href: "/factory", label: "Back to the factory board" };
    if (await getDesignerSession()) return { href: "/graphics", label: "Back to the graphics board" };
    if (await getClientSession()) return { href: "/client-side", label: "Back to your orders" };
  } catch {
    // Session lookup must never break the 404 page itself.
  }
  return { href: "/", label: "Go to the home page" };
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
