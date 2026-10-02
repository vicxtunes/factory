import { Button } from "@repo/ui/Button";

export default function ButtonStates() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button loading>Saving</Button>
      <Button disabled>Disabled</Button>
      <Button variant="secondary" loading>
        Loading
      </Button>
    </div>
  );
}
