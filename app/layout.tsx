import type { Metadata, Viewport } from "next";
import { Geist_Mono, Outfit } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { InstallCapture } from "@/components/pwa/InstallCapture";
import { AppSplash } from "@/components/pwa/AppSplash";
import { NavigationProgress } from "@/components/pwa/NavigationProgress";
import { KeepFresh } from "@/components/navigation/KeepFresh";
import { CurrencySymbolProvider } from "@/lib/currency/CurrencySymbolProvider";
import { DEFAULT_CURRENCY_SYMBOL } from "@/lib/currency/format";
import { fetchBaseCurrencySymbol } from "@/lib/queries";
import { getAppIdentity } from "@/lib/app-identity";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const app = await getAppIdentity();
  return {
    title: "Factory Order Tracker",
    description: app.description,
    applicationName: app.shortName,
    // iOS uses this for the home-screen label.
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: app.shortName,
    },
  };
}

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
          <OfflineBanner />
          <NavigationProgress />
          <KeepFresh />
          <AppSplash />
          <CurrencySymbolProvider symbol={symbol}>{children}</CurrencySymbolProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
