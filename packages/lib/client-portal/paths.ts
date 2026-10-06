// Where the client portal lives, for code that points into it: links in
// shared components shown in the portal, push-notification URLs sent to
// clients (resolved against the client app's own origin by its service
// worker), revalidatePath calls made from the portal.
//
// The portal is its own app (apps/client) served at the root of
// amingspace.com, so a portal path is just the path. Links built in the
// staff app that a person will open (share links, invoice links) need the
// client app's full address instead — use clientUrl().

const DEFAULT_CLIENT_ORIGIN = "https://amingspace.com";

/** A path inside the client portal: clientPath() is its home, clientPath("/orders") a page in it. */
export function clientPath(path = ""): string {
  return path || "/";
}

/**
 * Full URL of a client-portal page, for links made outside the portal.
 * Production defaults to the client domain; local development falls back
 * to a bare path unless NEXT_PUBLIC_CLIENT_ORIGIN is set.
 */
export function clientUrl(path = ""): string {
  const origin =
    process.env.NEXT_PUBLIC_CLIENT_ORIGIN ||
    (process.env.NODE_ENV === "production" ? DEFAULT_CLIENT_ORIGIN : undefined);
  return origin ? new URL(clientPath(path), origin).toString() : clientPath(path);
}
