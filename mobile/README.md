# AMING mobile apps (Capacitor)

Two thin native shells around the live site — the WebView loads the URL, so
web deploys reach the apps immediately and there's no static export.

| App | Folder | App id | Loads |
| --- | --- | --- | --- |
| AMING (customers) | `mobile/client` | `com.amingltd.client` | https://client.amingltd.com |
| AMING Factory (staff) | `mobile/factory` | `com.amingltd.factory` | https://factory.amingltd.com |

Each folder is its own npm project (kept out of the Next.js build: `mobile` is
excluded from `tsconfig.json`, ESLint and `.dockerignore`).

## Everyday commands (run inside `mobile/client` or `mobile/factory`)

```bash
npm install
npx cap sync          # after changing capacitor.config.ts or plugins
npx cap open android  # Android Studio  (build/run/sign from there)
npx cap open ios      # Xcode, macOS only
APP_URL=https://<preview>.vercel.app npx cap sync   # point a build at a preview (https only)
```

Icons and splash come from `resources/icon.png` (copied from `public/icon-512.png`);
regenerate with `npm run assets`. Use a 1024×1024 source for store submissions.

## Google sign-in

Google blocks OAuth in WebViews, so inside the apps `components/auth/GoogleButton.tsx`
uses the native account picker (`@capgo/capacitor-social-login`) and hands the ID
token to Supabase (`signInWithIdToken`). One-time setup, outside the code:

1. Google Cloud → Credentials: create an **Android** OAuth client per app
   (package name above + the SHA-1 of your debug/release keystore) and an **iOS**
   client per app (bundle id above). Keep the existing **Web** client ID — it's
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and what the plugin requests tokens for.
2. Supabase → Authentication → Providers → Google → **Authorized Client IDs**:
   add the Android and iOS client IDs.
3. iOS: add the reversed iOS client ID as a URL scheme in Xcode
   (Info → URL Types) and set `iOSClientId` in `initialize()` if you use one.
4. If Supabase rejects the token with a nonce error, enable "Skip nonce checks"
   for the Google provider.

## Not done yet

- **Push notifications:** the site uses web-push (VAPID), which doesn't run in
  native WebViews. Native push needs `@capacitor/push-notifications` with
  FCM/APNs plus a server-side sender next to `lib/push/send.ts`.
- **iOS pods:** `pod install` needs macOS — run `npx cap sync ios` on a Mac once.
- Not yet built or run on a device; this scaffold was created without Android
  Studio / Xcode.
