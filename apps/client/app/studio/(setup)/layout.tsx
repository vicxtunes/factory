import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Setting up a studio, waiting for review, and unlocking it: a plain frame,
// outside the studio workspace (which only opens once all of that is done).
export default function StudioSetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-4 sm:px-6">
        <Image src="/aming-logo-header.png" alt="AMING" width={193} height={40} className="h-7 w-auto" priority />
        <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
          ← Back to Aming
        </Link>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">{children}</main>
    </div>
  );
}
