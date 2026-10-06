import Link from "next/link";

import { ServiceForm } from "@repo/ui/offerings/ServiceForm";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "New service · My Studio" };

export default async function NewStudioServicePage() {
  const { scope } = await requireStudio();
  return (
    <>
      <Link href="/studio/offerings" className="text-xs font-medium text-brand-600 hover:underline">
        ← Packages & Services
      </Link>
      <p className="text-sm text-muted">The service and its packages, together. Photos and a video come next, once it&apos;s saved.</p>
      <ServiceForm basePath="/studio/offerings" scope={scope} />
    </>
  );
}
