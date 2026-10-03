import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { SetPinForm } from "@repo/ui/studio-portal/PortalForms";
import { inviteTokenSchema } from "@repo/lib/studio-portal/core";
import { portal, studioAtSlug } from "@repo/lib/studio-portal/server";

// A client's one-time set-up link from their studio (first PIN, or a
// forgotten one): client.<domain>/<slug>/welcome/<secret>. Works once, for
// 7 days, and only at that studio's address.

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your page", robots: { index: false, follow: false } };

export default async function WelcomePage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug: rawSlug, token: rawToken } = await params;
  const slug = decodeURIComponent(rawSlug);
  const at = await studioAtSlug(slug);
  if (!at) notFound();
  if (at.redirectTo) permanentRedirect(`/${at.redirectTo}/welcome/${rawToken}`);
  const token = inviteTokenSchema.safeParse(rawToken);
  const invited = token.success ? await portal.inviteFor(at.studio.id, token.data) : null;

  return (
    <main className="mx-auto w-full max-w-sm space-y-6 px-4 py-10 sm:py-16">
      <header className="space-y-1 text-center">
        <p className="text-sm text-muted">{at.studio.name}</p>
        <h1 className="text-2xl font-semibold">{invited ? `Welcome, ${invited.name}` : "This link has expired"}</h1>
      </header>
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-theme-xs">
        {invited && token.success ? (
          <SetPinForm slug={slug} token={token.data} />
        ) : (
          <p className="text-sm text-muted">
            It was already used or is more than 7 days old. Ask {at.studio.name} to send you a new one, or{" "}
            <Link href={`/${slug}`} className="font-medium text-brand-600 underline">
              sign in with your PIN
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}
