import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { OpenPageButton } from "@repo/ui/studio-portal/PortalForms";
import { inviteTokenSchema } from "@repo/lib/studio-portal/core";
import { portal, studioAtSlug } from "@repo/lib/studio-portal/server";

// The link to a client's page that their studio sends them:
// client.<domain>/<slug>/welcome/<secret>. One tap signs the device in for
// good, no PIN. Works once, for 7 days, and only at that studio's address.

export const dynamic = "force-dynamic";
export const metadata = { title: "Your page", robots: { index: false, follow: false } };

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
          <OpenPageButton slug={slug} token={token.data} />
        ) : (
          <p className="text-sm text-muted">
            It was already used or is more than 7 days old. Ask {at.studio.name} to send you a new one, or go to{" "}
            <Link href={`/${slug}`} className="font-medium text-brand-600 underline">
              their showroom
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}
