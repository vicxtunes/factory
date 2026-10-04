import Link from "next/link";

import { OfferingForm } from "@repo/ui/offerings/OfferingForm";
import { requireStudio } from "@repo/lib/studios/server";

export const metadata = { title: "New package or service — My Studio" };

export default async function NewStudioOfferingPage() {
  const { scope } = await requireStudio();
  return (
    <>
      <Link href="/studio/offerings" className="text-xs font-medium text-brand-600 hover:underline">
        ← Packages & Services
      </Link>
      <OfferingForm basePath="/studio/offerings" currency={scope.currency} />
    </>
  );
}
