import { SocialInbox } from "@repo/ui/social/SocialInbox";
import { requireStudio } from "@repo/lib/studios/server";
import { canUse } from "@repo/lib/team/core";

export const metadata = { title: "Inbox · Social Media" };

export default async function SocialInboxPage() {
  const { access } = await requireStudio("catalog");
  return <SocialInbox canReply={canUse(access, "catalog", "manage")} />;
}
