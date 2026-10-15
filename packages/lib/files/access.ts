import "server-only";

// Whose files a request reaches, and with what rights, from where it comes
// (`Via`): the studio's workspace (everything with the Files area or as the
// owner; otherwise what's shared with the member), a client's own page (what's
// shared with them) or a share link (what it opens, while it lasts). Worked
// out from the session or the link, never from what the browser claims.

import { localDate } from "@repo/lib/accounting/core/period";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";
import { studioOfCaller } from "@repo/lib/studios/server";
import { canUse } from "@repo/lib/team/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { FULL_ACCESS, type Commenter, type FileAccess, type Via } from "./core";
import { FileError } from "./ports";
import { files } from "./server";

export interface FilesCaller {
  scope: TenantScope;
  access: FileAccess;
  /** Who they are, for what they write (comments): someone with a link names themself. */
  who: Commenter | null;
  /** Which of the business's people they are, for the tasks given to them. */
  person: { kind: "owner" } | { kind: "member"; memberId: string } | { kind: "client"; customerId: string } | { kind: "guest" };
  /** The business, to tell its owner when a client finishes a task. */
  studio: { name: string; ownerClientId: string };
}

/** The caller's files and rights, or a FileError when they have none here. */
export async function filesCaller(via: Via): Promise<FilesCaller> {
  if (via.as === "studio") {
    const { scope, access, session, studio } = await studioOfCaller("anyone");
    const who: Commenter = { kind: access.owner ? "studio" : "member", name: session.name };
    const base = { scope, who, studio: { name: studio.name, ownerClientId: studio.ownerClientId } };
    const person = access.owner ? ({ kind: "owner" } as const) : ({ kind: "member", memberId: access.memberId } as const);
    if (canUse(access, "files")) return { ...base, access: FULL_ACCESS, person };
    return { ...base, access: await files.memberAccess(scope, access.owner ? "" : access.memberId), person };
  }
  const at = await studioAtSlug(via.slug);
  if (!at) throw new FileError("That business isn't here any more.");
  const studio = { name: at.studio.name, ownerClientId: at.studio.ownerClientId };
  if (via.as === "client") {
    const me = await portalClient(at.studio.id);
    if (!me) throw new FileError("Sign in again to see your files.");
    return {
      scope: at.scope,
      access: await files.clientAccess(at.scope, me.customerId),
      who: { kind: "client", name: me.name },
      person: { kind: "client", customerId: me.customerId },
      studio,
    };
  }
  const access = await files.linkAccess(at.scope, via.token, localDate(new Date(), at.scope.timeZone));
  if (!access) throw new FileError("This link has stopped working. Ask the business for a new one.");
  return { scope: at.scope, access, who: null, person: { kind: "guest" }, studio };
}
