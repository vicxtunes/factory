import { notFound, permanentRedirect, redirect } from "next/navigation";

import { BusinessMessages } from "@repo/ui/business-chat/BusinessMessages";
import { messagesOn } from "@repo/lib/business-messages/server";
import { studioAccess } from "@repo/lib/studio-access/server";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";

import { StudioShell } from "../studio-shell";

// A business's client's chats with it (packages/lib/business-messages): their
// general chat and one per project. Signed in on this business's page; Pro businesses only.

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages", robots: { index: false, follow: false } };

export default async function ClientMessagesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> }) {
  const slug = decodeURIComponent((await params).slug);
  const at = await studioAtSlug(slug);
  if (!at) notFound();
  if (at.redirectTo) permanentRedirect(`/${at.redirectTo}/messages`);
  const me = await portalClient(at.studio.id);
  if (!me) redirect(`/${slug}`);
  if (!(await messagesOn(at.studio.id))) redirect(`/${slug}/me`);
  const [logoUrl, { c }] = await Promise.all([studioAccess.logoUrl(at.studio.logoKey), searchParams]);
  return (
    <StudioShell studio={{ name: at.studio.name, logoUrl, slug }} signedInAs={me.name} title="Messages">
      <BusinessMessages slug={slug} startWith={c ?? null} />
    </StudioShell>
  );
}
