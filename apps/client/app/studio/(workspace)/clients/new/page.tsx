import Link from "next/link";

import { CustomerForm } from "@repo/ui/customers/CustomerForm";

export const metadata = { title: "New client — My Studio" };

export default function NewStudioClientPage() {
  return (
    <>
      <Link href="/studio/clients" className="text-xs font-medium text-brand-600 hover:underline">
        ← Clients
      </Link>
      <CustomerForm basePath="/studio/clients" />
    </>
  );
}
