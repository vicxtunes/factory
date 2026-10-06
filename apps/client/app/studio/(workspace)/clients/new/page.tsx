import { BackLink } from "@repo/ui/navigation/back";

import { CustomerForm } from "@repo/ui/customers/CustomerForm";

export const metadata = { title: "New client · My Business" };

export default function NewStudioClientPage() {
  return (
    <>
      <BackLink href="/studio/clients" className="text-xs font-medium text-brand-600 hover:underline">
        ← Clients
      </BackLink>
      <CustomerForm basePath="/studio/clients" />
    </>
  );
}
