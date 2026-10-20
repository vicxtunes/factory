import Link from "next/link";

import { Button, buttonClass } from "@repo/ui/Button";

// Every action is a button, never plain text: the variants, the small size for
// actions inside a row or card, and a link that acts as a button.
export default function ButtonVariants() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="intake">Submit order</Button>
        <Button variant="danger">Cancel order</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary">
          Edit
        </Button>
        <Button size="sm" variant="danger">
          Remove
        </Button>
        <Button size="sm">Retry</Button>
        <Link href="#" className={buttonClass("secondary", "sm")}>
          Open their folder
        </Link>
      </div>
    </div>
  );
}
