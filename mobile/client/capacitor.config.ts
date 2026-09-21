import type { CapacitorConfig } from "@capacitor/cli";

// Thin shell: the WebView loads the live site, so web deploys reach the app
// immediately. `www/` only holds an offline placeholder that Capacitor
// requires. Set APP_URL to test against another host (e.g. a Vercel preview or
// a Codespaces URL); use https, cleartext is disabled.
const url = process.env.APP_URL ?? "https://client.amingltd.com";

const config: CapacitorConfig = {
  appId: "com.amingltd.client",
  appName: "AMING",
  webDir: "www",
  server: {
    url,
    // Keep the shell on its own host. Everything else (Supabase, Google)
    // opens outside the app or is handled natively.
    allowNavigation: [new URL(url).host, "*.supabase.co"],
  },
  plugins: {
    SplashScreen: { backgroundColor: "#f67413", launchAutoHide: true, showSpinner: false },
    StatusBar: { style: "DARK", backgroundColor: "#f67413" },
  },
};

export default config;
