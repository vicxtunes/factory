"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";

// Inline "Set PIN" control for the worker / designer tables. Collapsed to a
// button; expands to a PIN field + Save. The parent runs the server action
// and handles the toast/refresh.
export function PinReset({
  onSave,
  pending,
}: {
  onSave: (pin: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [done, setDone] = useState(false);

  if (!open) {
    return (
      <Button
        variant="secondary"
        className="min-h-9 text-xs"
        disabled={pending}
        onClick={() => {
          setOpen(true);
          setDone(false);
        }}
      >
        {done ? "PIN updated ✓" : "Set PIN"}
      </Button>
    );
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(pin);
        setPin("");
        setOpen(false);
        setDone(true);
      }}
    >
      <TextInput
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        inputMode="numeric"
        placeholder="New PIN"
        autoFocus
        className="min-h-9 w-24 text-xs"
      />
      <Button variant="primary" type="submit" className="min-h-9 text-xs" disabled={pending}>
        Save
      </Button>
      <Button
        variant="ghost"
        type="button"
        className="min-h-9 text-xs"
        onClick={() => {
          setOpen(false);
          setPin("");
        }}
      >
        Cancel
      </Button>
    </form>
  );
}
