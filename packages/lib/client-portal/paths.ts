// Where the client portal lives, for code that points into it: links in
// shared components shown in the portal, push-notification URLs sent to
// clients (resolved against the client app's own origin by its service
// worker), revalidatePath calls made from the portal.
//
// The portal is its own app (apps/client) served at the root of
// client.<domain>, so a portal path is just the path. Links built in the
// staff app that a person will open (share links, invoice links) need the
// client app's full address instead — use clientUrl().

/** A path inside the client portal: clientPath() is its home, clientPath("/orders") a page in it. */
export function clientPath(path = ""): string {
  return path || "/";
}

/**
 * Full URL of a client-portal page, for links made outside the portal.
 * Falls back to the bare path when NEXT_PUBLIC_CLIENT_ORIGIN isn't set
 * (local dev with only one app running).
 */
export function clientUrl(path = ""): string {
  const origin = process.env.NEXT_PUBLIC_CLIENT_ORIGIN;
  return origin ? new URL(clientPath(path), origin).toString() : clientPath(path);
}
