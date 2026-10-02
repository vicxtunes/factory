// Where the client portal lives, for code OUTSIDE the portal that points into
// it: push-notification URLs sent to clients, revalidatePath calls, share
// links, shared components shown in the portal. Today the portal is served
// under /client-side in this same app (proxy.ts shows it at the root of
// client.<domain>); when it becomes its own app the base turns into "" and
// only this file changes. Links inside app/client-side stay literal — they
// move with the portal.

export const CLIENT_PORTAL_BASE = "/client-side";

/** A client-portal path: clientPath() is the portal root, clientPath("/orders") a page in it. */
export function clientPath(path = ""): string {
  return `${CLIENT_PORTAL_BASE}${path}` || "/";
}
