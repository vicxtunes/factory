import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getClientSession } from "@repo/lib/auth/session";
import { STUDIOS_ENABLED } from "@repo/lib/studios/feature";
import { vendors } from "@repo/lib/vendors/server";

import { VendorJoin } from "./vendor-join";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join as a vendor" };

// A vendor's own way in, one question a screen (./vendor-join.tsx): their
// answers, then an account with an email and a password (checked by an
// emailed code), then their own side (/vendors). A vendor who has joined
// goes straight there.
export default async function VendorJoinPage() {
  if (!STUDIOS_ENABLED) notFound();
  const session = await getClientSession();
  if (session && (await vendors.mine(session.client_id))) redirect("/vendors");
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
