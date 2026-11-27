import { notFound } from "next/navigation";

import { Leads } from "@repo/ui/business-chat/Leads";
import { HomeHero } from "@repo/ui/home/HomeBits";
import { messagesOn } from "@repo/lib/business-messages/server";
import { isPro } from "@repo/lib/pro/core";
import { proStatus } from "@repo/lib/pro/server";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "Leads" };

// People who wrote from the business's page or its ads (packages/lib/business-messages/leads.ts): Pro, with Messages.
export default async function LeadsPage() {
  const { studio } = await requireStudio("clients");
  if (!(await messagesOn(studio.id))) {
    if (isPro(await proStatus(studio.id))) notFound();
    return <HomeHero title="Turn visitors into bookings" text="People who message you from your page land here. Answer them in the app and see who booked." cta={{ label: "Get Pro", href: "/studio/pro" }} />;
  }
  return <Leads />;
}
