import Link from "next/link";

import { ServiceForm } from "@repo/ui/offerings/ServiceForm";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "New service · My Studio" };

export default async function NewStudioServicePage() {
  await requireStudio();
  return (
    <>
      <Link href="/studio/offerings" className="text-xs font-medium text-brand-600 hover:underline">
        ← Packages & Services
      </Link>
      <p className="text-sm text-muted">Name the service, e.g. Wedding Photography. You&apos;ll add its packages and photos next.</p>
      <ServiceForm basePath="/studio/offerings" />
    </>
  );
}
