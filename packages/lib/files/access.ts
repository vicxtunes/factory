import "server-only";

// Whose files a request reaches, and with what rights, from where it comes
// (`Via`): the studio's workspace (everything with the Files area or as the
// owner; otherwise what's shared with the member), a vendor's own Drive
// (everything in it), a vendor's job (its project's folder), a client's own page (what's
// shared with them), a share link (what it opens, while it lasts) or a
// client's task link (its folder, to look at, and that task only). Worked out
// from the session or the link, never from what the browser claims.

import { localDate } from "@repo/lib/accounting/core/period";
import { getClientSession } from "@repo/lib/auth/session";
import { portalClient, studioAtSlug } from "@repo/lib/studio-portal/server";
import { studioOfCaller, studios } from "@repo/lib/studios/server";
import { tasks } from "@repo/lib/tasks/server";
import { canUse } from "@repo/lib/team/core";
import { studioScope } from "@repo/lib/studios/core";
import { reachesFolder } from "@repo/lib/vendors/core";
import { vendorDrive, vendorJobs, vendors } from "@repo/lib/vendors/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { FULL_ACCESS, type Commenter, type FileAccess, type Via } from "./core";
import { FileError } from "./ports";
import { files } from "./server";
import type { FileService } from "./service";

export interface FilesCaller {
  /** The Drive it's in: a studio's (`files`), or a vendor's own (`vendorDrive`). */
  drive: FileService;
  scope: TenantScope;
  access: FileAccess;
  /** Who they are, for what they write (comments): someone with a link names themself. */
  who: Commenter | null;
  /** Which of the business's people they are, for the tasks given to them. */
  person: { kind: "owner" } | { kind: "member"; memberId: string } | { kind: "client"; customerId: string; onlyTask?: string } | { kind: "guest" };
  /** The business, to tell its owner when a client finishes a task. */
  studio: { name: string; ownerClientId: string };
}

/** The caller's files and rights, or a FileError when they have none here. */
export async function filesCaller(via: Via): Promise<FilesCaller> {
  if (via.as === "vendor") {
    // A vendor's own Drive (packages/lib/vendors): everything in it is theirs.
    const session = await getClientSession();
    const vendor = session ? await vendors.mine(session.client_id) : null;
    if (!session || !vendor) throw new FileError("Sign in as a vendor to see your Drive.");
    return {
      drive: vendorDrive,
      scope: vendors.driveScope(vendor),
      access: FULL_ACCESS,
      who: { kind: "studio", name: vendor.name },
      person: { kind: "owner" },
      studio: { name: vendor.name, ownerClientId: vendor.clientId },
    };
  }
  if (via.as === "job") {
    // The project's folder, from accepting the job until it's paid: download the work, upload what's done.
    const session = await getClientSession();
    const job = session ? await vendorJobs.vendorJob(session.client_id, via.id) : null;
    const studio = job && reachesFolder(job.status) ? await studios.get(job.tenantId) : null;
    if (!job || !studio) throw new FileError("This job's folder isn't open to you.");
    const scope = studioScope(studio);
    const folderId = await files.projectFolder(scope, job.projectId);
    if (!folderId) throw new FileError("This project has no folder.");
    return {
      drive: files,
      scope,
      access: { kind: "shared", grants: [{ folderId, role: "contributor", canDownload: true }] },
      who: { kind: "member", name: job.vendor.name },
      person: { kind: "guest" },
      studio: { name: studio.name, ownerClientId: studio.ownerClientId },
    };
  }
  if (via.as === "studio") {
    const { scope, access, session, studio } = await studioOfCaller("anyone");
    const who: Commenter = { kind: access.owner ? "studio" : "member", name: session.name };
    const base = { drive: files, scope, who, studio: { name: studio.name, ownerClientId: studio.ownerClientId } };
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
      drive: files,
      scope: at.scope,
      access: await files.clientAccess(at.scope, me.customerId),
      who: { kind: "client", name: me.name },
      person: { kind: "client", customerId: me.customerId },
      studio,
    };
  }
  if (via.as === "task") {
    const task = await tasks.byShareToken(at.scope, via.token);
    if (!task?.folderId || !task.customerId) throw new FileError("This link has stopped working. Ask the business for a new one.");
    return {
      drive: files,
      scope: at.scope,
      // The task's folder, to look at (pictures show, nothing downloads).
      access: { kind: "shared", grants: [{ folderId: task.folderId, role: "viewer", canDownload: false }] },
      who: { kind: "client", name: task.customerName ?? "Client" },
      person: { kind: "client", customerId: task.customerId, onlyTask: task.id },
      studio,
    };
  }
  const access = await files.linkAccess(at.scope, via.token, localDate(new Date(), at.scope.timeZone));
  if (!access) throw new FileError("This link has stopped working. Ask the business for a new one.");
  return { drive: files, scope: at.scope, access, who: null, person: { kind: "guest" }, studio };
}
