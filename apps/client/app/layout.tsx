import type { Metadata, Viewport } from "next";
import { Geist_Mono, Outfit } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { OfflineBanner } from "@repo/ui/pwa/OfflineBanner";
import { InstallCapture } from "@repo/ui/pwa/InstallCapture";
import { AppSplash } from "@repo/ui/pwa/AppSplash";
import { NavigationProgress } from "@repo/ui/pwa/NavigationProgress";
import { KeepFresh } from "@repo/ui/navigation/KeepFresh";
import { BackHistory } from "@repo/ui/navigation/back";
import { CurrencySymbolProvider } from "@repo/lib/currency/CurrencySymbolProvider";
import { DEFAULT_CURRENCY_SYMBOL } from "@repo/lib/currency/format";
import { fetchBaseCurrencySymbol } from "@repo/lib/queries";
import { APP_IDENTITY as app } from "./identity";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Links in share previews (WhatsApp, Facebook, …) must be full addresses: the
// portal's own, from NEXT_PUBLIC_CLIENT_ORIGIN (https://www.amingspace.com).
const origin = process.env.NEXT_PUBLIC_CLIENT_ORIGIN;

export const metadata: Metadata = {
  ...(origin ? { metadataBase: new URL(origin) } : {}),
  title: { default: app.title, template: `%s - ${app.name}` },
  description: app.description,
  applicationName: app.shortName,
  // Set here, not as app/favicon.ico & co (which Next adds to every page), so
  // a studio's pages can replace them with their own ([slug]/layout.tsx).
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "256x256" },
      { url: "/icon.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/apple-icon.png", sizes: "180x180" },
  },
  openGraph: { siteName: app.name, title: app.title, description: app.description, type: "website" },
  // iOS uses this for the home-screen label.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: app.shortName,
  },
};

export const viewport: Viewport = {
  themeColor: "#f67413",
  width: "device-width",
  initialScale: 1,
  // App-like feel: no pinch-zoom, and the page never rescales itself. Also
  // extends the layout under the notch/home indicator (safe-area padding is
  // already handled where it matters, e.g. the home bar).
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Never let a failed lookup take the whole app down — fall back to UGX.
  const symbol = await fetchBaseCurrencySymbol().catch(() => DEFAULT_CURRENCY_SYMBOL);
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SerwistProvider swUrl="/serwist/sw.js">
          <InstallCapture />
          <OfflineBanner showBanner={false} />
          <NavigationProgress />
          <BackHistory />
          <KeepFresh />
          <AppSplash />
          <CurrencySymbolProvider symbol={symbol}>{children}</CurrencySymbolProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
