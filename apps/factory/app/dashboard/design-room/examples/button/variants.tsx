import { Button } from "@repo/ui/Button";

export default function ButtonVariants() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="intake">Submit order</Button>
      <Button variant="danger">Cancel order</Button>
      <Button variant="ghost">Ghost</Button>
    </div>
  );
}
