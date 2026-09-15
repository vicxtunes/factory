import type { Metadata, Viewport } from "next";
import { Geist_Mono, Outfit } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { InstallCapture } from "@/components/pwa/InstallCapture";
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
  themeColor: "#f9a465",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SerwistProvider swUrl="/serwist/sw.js">
          <InstallCapture />
          <OfflineBanner />
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
