import Link from "next/link";
import { notFound } from "next/navigation";

import { getClientSession } from "@repo/lib/auth/session";
import { STUDIOS_ENABLED } from "@repo/lib/studios/feature";

import { VendorJoin } from "./vendor-join";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join as a vendor · Aming Space" };

// A vendor's own way in: what the business does, then an account with an
// email and a password (checked by an emailed code), then the business's
// set-up (/studio/welcome). Someone already signed in only chooses what it
// does.
export default async function VendorJoinPage() {
  if (!STUDIOS_ENABLED) notFound();
  const session = await getClientSession();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Aming <span className="text-brand-500">Space</span>
        </Link>
        {session ? null : (
          <Link href="/?signin=1" className="text-sm font-medium hover:underline">
            Log in
          </Link>
        )}
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-16 sm:px-6">
        <p className="text-sm font-semibold tracking-widest text-brand-600 uppercase dark:text-brand-400">Vendors on Aming</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Join as a vendor</h1>
        <p className="mt-2 text-muted">Photo editors, videographers and event vendors: get booked, send invoices and get paid, under your own name.</p>
        <div className="mt-8">
          <VendorJoin signedInAs={session?.name ?? null} />
        </div>
      </main>
    </div>
  );
}
