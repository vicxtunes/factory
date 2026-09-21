import type { Metadata, Viewport } from "next";
import { Geist_Mono, Outfit } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { InstallCapture } from "@/components/pwa/InstallCapture";
import { AppSplash } from "@/components/pwa/AppSplash";
import { NavigationProgress } from "@/components/pwa/NavigationProgress";
import { CurrencySymbolProvider } from "@/lib/currency/CurrencySymbolProvider";
import { DEFAULT_CURRENCY_SYMBOL } from "@/lib/currency/format";
import { fetchBaseCurrencySymbol } from "@/lib/queries";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Factory Order Tracker",
  description: "Internal production tracking for the print factory.",
  applicationName: "AMING",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AMING",
  },
};

export const viewport: Viewport = {
  themeColor: "#f67413",
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
          <AppSplash />
          <CurrencySymbolProvider symbol={symbol}>{children}</CurrencySymbolProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
