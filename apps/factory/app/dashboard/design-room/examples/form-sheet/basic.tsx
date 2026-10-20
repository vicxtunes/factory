"use client";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { SheetButton } from "@repo/ui/SheetButton";

// Every create or edit form opens over the page, never on a page of its own:
// from the right on a desktop, from the bottom on a phone. A button opens it
// (SheetButton); a list's "?new" or a record's "?edit" can too (UrlSheet).
export default function FormSheetBasic() {
  return (
    <SheetButton label="Add a task" title="Add a task" variant="primary">
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <Field label="What needs doing">
          <TextInput placeholder="e.g. Cull the ceremony photos" />
        </Field>
        <Field label="Due">
          <TextInput type="date" />
        </Field>
        <Button type="submit" className="w-full">
          Add task
        </Button>
      </form>
    </SheetButton>
  );
}
