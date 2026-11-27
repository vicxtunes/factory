import { notFound } from "next/navigation";

import { BusinessMessages } from "@repo/ui/business-chat/BusinessMessages";
import { HomeHero } from "@repo/ui/home/HomeBits";
import { messagesOn } from "@repo/lib/business-messages/server";
import { isPro } from "@repo/lib/pro/core";
import { proStatus } from "@repo/lib/pro/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Messages" };

// The business's chats with its clients (packages/lib/business-messages): Pro only.
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { studio } = await requireStudio("clients");
  if (!(await messagesOn(studio.id))) {
    // A Pro business that doesn't have it yet (it's being tried with one business first).
    if (isPro(await proStatus(studio.id))) notFound();
    return <HomeHero title="Chat with your clients" text="Messages, photos, voice notes and files with every client and on every project, in one place." cta={{ label: "Get Pro", href: "/studio/pro" }} />;
  }
  const { c } = await searchParams;
  return <BusinessMessages slug={null} startWith={c ?? null} />;
}
