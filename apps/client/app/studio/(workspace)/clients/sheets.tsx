import { CustomerForm } from "@repo/ui/customers/CustomerForm";
import { UrlSheet } from "@repo/ui/UrlSheet";

/** "New client" over the clients list (?new); saving opens the client. */
export function NewClientSheet() {
  return (
    <UrlSheet title="New client" closeHref="/studio/clients">
      <CustomerForm basePath="/studio/clients" />
    </UrlSheet>
  );
}
