# Studio portal module

How a studio's clients get in. Each studio has **its own permanent address**,
`client.<domain>/<slug>` (e.g. `/amina-studio`). **No password, no PIN**: the device a client books
on stays signed in, and the studio's one-time link signs in any other device (see
packages/lib/booking-requests/README.md). Clients who set a PIN before can still sign in with their
**phone number and PIN**. No account, no app.

## The studio's address

- **Setting it:** on **Business profile**, pre-filled from the name (`slugFromName`). It allows
  3–40 lowercase letters, digits and hyphens.
- **Shared space:** the slug shares the client portal's top level with product pages
  (`/a4-prints`). The database keeps them apart:
  - `studio_set_slug()` refuses another studio's slug, a product's slug, or an app page
    (`product_slug_reserved`, now including `studio`, `invoice`, `q`, `i`, `r`, `me`, `welcome`).
  - `products_assign_slug` steps around studio slugs (a product "Amina Studio" becomes
    `amina-studio-2`) and refuses one set by hand.
- **Renaming keeps old links working:** every slug a studio has had stays in `studio_slugs`, and an
  old one **redirects** (308) to the current one, so links shared in WhatsApp never break.
- **The public page** (`apps/client/app/[slug]/page.tsx`, which shows a product if one matches,
  otherwise the studio): name, address, Book us on WhatsApp, Call, Email, packages & services, and
  the sign-in box. Public details only.

## Client sign-in

1. **Set-up link** (first time, or a forgotten PIN):
   - On a client's page the studio taps **Send portal invite** / **Send PIN reset link**, and
     WhatsApp opens with the link: `/<slug>/welcome/<secret>`.
   - The secret is 32 random bytes; **only its sha256 is stored**.
   - It works **once, for 7 days, at that studio only**, and a new link cancels the old one.
   - The client chooses a PIN and is signed in.
2. **Phone + PIN** on the studio's page:
   - The phone is stored in one form (`0772…` = `+256772…`) and is unique per studio.
   - The PIN is stored as a **bcrypt** hash.
   - A wrong phone and a wrong PIN get the **same answer**, and a missing client costs the same
     bcrypt check, so neither the message nor the timing tells who is a client.
   - **5 wrong PINs lock that client for 15 minutes.**
3. **Session:**
   - One signed, httpOnly cookie **per studio** (`sp_<tenantId>`), valid 90 days, so being
     signed in at one studio means nothing at another.
   - Setting a new PIN signs out older sessions (the cookie carries when the PIN was set).
   - Sign out is on the page.

**The client's page** (`/<slug>/me`, only for the client signed in there):
- Their projects (stage, **Download your photos** when the studio has pasted a link, prints and
  albums from Aming with progress).
- Coming bookings.
- Quotations (open ones on top; the existing `/q/` link to accept).
- Invoices with what's left to pay (the existing `/i/` link, with payments and receipts).

**The studio** sees on each client's page whether a PIN is set, a pending link, and when they last
signed in. **The boss** sees each studio's public address.

## Layout

```
packages/lib/studio-portal/
  core/
    model.ts       PortalSession, PortalStatus, SignInRecord.
    rules.ts       SLUG_PATTERN, slugFromName, lockout (5 / 15 min), link and session lifetimes.
    schema.ts      zod: slug, PIN, sign-in (phone → stored form), set-up secret.
    core.test.ts
  ports.ts         PortalStore, PortalSecrets (tokens, digest, PIN hash), PortalError.
  service.ts       class StudioPortalService: resolve, currentSlug, setSlug, status, invite,
                   inviteFor, acceptInvite, signIn, check.
  service.test.ts  In-memory store and fake secrets.
  adapters/supabase/store.ts
  server.ts        Real secrets (crypto, bcrypt), the per-studio cookie, studioAtSlug, portalClient.
  actions.ts       portalSignIn, portalSetPin, portalSignOut (by slug); setStudioSlug,
                   createPortalInvite (studio owner).
packages/ui/studio-portal/  StudioPublicPage, PortalForms (sign-in, set PIN, sign out),
                            ClientPortalHome, StudioAddressForm, ClientPortalPanel.
apps/client/app/[slug]/     page.tsx (product or studio), me/, welcome/[token]/.
supabase/migrations/20261003190000_studio_portal.sql
```

Also in this phase: projects get a **photos link** (`photos_url`, https only), set on the project
form.

## Testing

- `npm test`:
  - Slug suggestions and rules; PIN and phone input; the lockout count.
  - The service: old slugs redirect, a taken slug is refused, invite → PIN → signed in once,
    links expire / belong to one studio / need a phone, wrong number = wrong PIN, five wrong PINs
    lock until the time is up, and a new PIN signs out older sessions; studio separation.
- Against Postgres through PostgREST, with the real product-slug migration and real hashing:
  - A product named like a studio steps around it; product slugs, app pages and other studios'
    slugs are refused; a hand-set product slug can't take a studio's; old slugs kept.
  - Only the invite's digest is stored; the PIN is bcrypt; the link works once, at its own studio.
  - The same phone at another studio gets nothing; the lockout; a reset clears the lock and
    signs out the older session.
  - `anon` denied.
