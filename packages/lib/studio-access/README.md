# Studio access module

Who may operate a studio, and on which devices. A new studio is **set up** by its owner,
**reviewed** by the boss, and then opened on each device with the **studio password**. Until
it's approved, the studio is closed: no workspace, no public page, no client sign-in.

## Statuses

| Status | Meaning | The owner sees | Public page and client sign-in |
| --- | --- | --- | --- |
| `onboarding` | Setting up (every studio starts here, existing ones too) | The set-up steps | Off |
| `in_review` | Submitted, waiting for the boss | "Being reviewed" | Off |
| `changes_requested` | Sent back with the boss's reason | The reason, and the steps to fix and resubmit | Off |
| `active` | Approved | The workspace (after the password) | On |
| `suspended` | Stopped by the boss, with a reason | The reason | Off |

The boss **approves** (any stage but `active` → `active`), **sends back** (`in_review` →
`changes_requested`, reason required) or **suspends** (any → `suspended`, reason required).

- **Approve now**: the boss can open a studio that's still setting up, without waiting for it to
  be submitted, once every set-up step is done (details, address, verified email, password);
  otherwise they're told what's missing.
- **Reinstate** (approving a suspended studio) opens it if it's set up; a studio suspended before
  it was set up goes back to `onboarding` instead, so it can finish ("can continue setting up").

The owner gets an **email** (once they have a verified one) and a **push notification** each time. Two decisions at once can't both
apply: the status only changes if it's still what the boss saw.

## Set-up (`/studio/welcome`)

1. **Welcome**: what the studio gets.
2. **Details**: studio name, owner's first and last name, studio phone (the phone box with the
   country picker; stored as `+256…`). Pre-filled from the owner's Aming name and phone, to
   confirm or change for the studio.
3. **Logo** (optional): shrunk to 512px in the browser (white background, JPEG), uploaded to a
   signed link in the photo bucket (R2), checked (≤ 1 MB) and moved to
   `studios/<tenant>/logo-<id>.jpg`. The old one is deleted. Also on Business profile.
4. **Address**: the studio's slug (packages/lib/studio-portal).
5. **Email**: a **6-digit code** by email (Resend).
   - It works for **10 minutes** and **5 tries**.
   - **One code at a time** (emails cost; Resend's free tier is small): asking again while one is
     pending sends nothing and points to it. A new one can be sent once it's used (right, or 5
     wrong tries) or expired.
   - Only an **HMAC** of the code is stored (keyed with `APP_SECRET`, bound to the studio and
     purpose), compared in constant time, and it works once.
6. **Password**: typed twice.
   - At least **8 characters** (bcrypt's limit of 72 at most).
   - Common passwords, one repeated character, digits only, or the studio's name or phone are
     refused.
   - Stored as a **bcrypt** hash.
7. **Submit**: only once 2, 4, 5 and 6 are done.

Each step saves as it's done, so leaving and coming back resumes at the first missing step.

## The studio password (`/studio/unlock`)

- **Per device, every 30 days:** a good password sets a signed, httpOnly cookie
  (`studio_unlock`) carrying the studio, when the password was set, and an expiry 30 days out.
- **Locks:**
  - Signing out of Aming deletes the cookie, which locks the studio.
  - A new password signs every other device out, because their cookie carries the old
    `password_set_at`.
- **Lockout:** 5 wrong passwords lock the studio for 15 minutes.
- **Forgot it:**
  - A reset code goes to the verified email (same rules as above).
  - A new password signs other devices out and unlocks this one.
  - The owner is emailed that it changed.

## Where it's enforced

- `packages/lib/studios/server.ts` (the one place every studio page and action finds its studio):
  - `requireStudio()` (workspace pages): not active → `/studio/welcome`; not unlocked on this
    device → `/studio/unlock`.
  - `studioOfCaller()` (every studio module's actions): refuses unless active and unlocked.
  - `studioForSetup()`: the address and logo, while setting up or once unlocked.
  - `ownStudio()` / `requireOwnStudio()`: set-up, unlock and reset, in any status.
- `studioAtSlug()` (packages/lib/studio-portal) returns nothing for a studio that isn't active.
  So its public page, client sign-in, galleries and share links are all off.

## Layout

```
packages/lib/studio-access/
  core/
    model.ts       StudioStatus, StudioAccess, EmailCode, StudioForReview, ReviewDecision.
    emails.ts      The emails (Aming Space branded HTML + plain text): code, password changed, review. Edit wording here.
    rules.ts       Code (one at a time), password and lock rules; passwordProblem; afterDecision; isUnlocked; maskEmail.
    schema.ts      zod: details, email, code, new password (twice), unlock, reset, review, upload key.
  ports.ts         AccessStore, Mailer, AccessSecrets, LogoFiles, OwnerNotifier, AccessError.
  service.ts       class StudioAccessService: set-up, logo, codes, password, unlock, reset, review.
  service.test.ts  In-memory fakes.
  adapters/supabase/store.ts   tenants' access columns, studio_email_codes.
  adapters/resend/mailer.ts    Resend's HTTP API.
  server.ts        Wiring (HMAC, bcrypt, R2, push), the device-unlock cookie.
  actions.ts       Owner: details, logo, email code, password, submit, unlock, reset. Boss: reviewStudio.
packages/ui/studio-access/   OnboardingWizard, LogoUploader, UnlockForm, ReviewCard, ReviewPanel, StatusBadge.
apps/client/app/studio/(setup)/       welcome/, unlock/ (outside the workspace frame).
apps/factory/app/dashboard/(app)/studios/  "Waiting for review" list; ReviewCard on each studio.
supabase/migrations/20261004120000_studio_access.sql
```

## Settings

On both Vercel projects (the factory app emails review decisions):

- `RESEND_API_KEY`: Resend → API Keys.
- `EMAIL_FROM`: the sender on a domain verified in Resend, e.g. `Aming <studio@yourdomain.com>`.

Without a key outside production, emails are printed in the server log, so codes can be tried
locally. The emails' logo is embedded in each email (`adapters/resend/logo.ts`, from the client app's
`icon-192.png`), so it shows even where mail apps hide outside images. The factory app also needs the `R2_*` settings to show logos on the review page.
