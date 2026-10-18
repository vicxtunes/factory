import Link from "next/link";
import { notFound } from "next/navigation";

import { getClientSession } from "@repo/lib/auth/session";
import { STUDIOS_ENABLED } from "@repo/lib/studios/feature";

import { VendorJoin } from "./vendor-join";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join as a vendor" };

// A vendor's own way in, one question a screen (./vendor-join.tsx): their
// answers, then an account with an email and a password (checked by an
// emailed code), then the business's set-up (/studio/welcome).
export default async function VendorJoinPage() {
  if (!STUDIOS_ENABLED) notFound();
  const session = await getClientSession();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex h-[4.5rem] max-w-xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Aming <span className="text-brand-500">Space</span>
        </Link>
        {session ? null : (
          <Link href="/?signin=1" className="text-sm font-medium hover:underline">
            Log in
          </Link>
        )}
      </header>
      <main>
        <VendorJoin signedInAs={session?.name ?? null} />
      </main>
    </div>
  );
}
