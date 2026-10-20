"use client";

import { useState, type ReactNode } from "react";

import { Button, type ButtonSize, type ButtonVariant } from "./Button";
import { FormSheet } from "./FormSheet";

/**
 * A button that opens a form in the sheet (the panel from the right on a
 * desktop, from the bottom on a phone) instead of the form sitting open on the
 * page: "Add a task", "Order from Aming". The form stays open after saving,
 * to add another; closing it is the sheet's.
 */
export function SheetButton({
  label,
  title,
  variant = "secondary",
  size = "md",
  sheetSize,
  children,
}: {
  label: ReactNode;
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  sheetSize?: "md" | "lg";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <FormSheet open={open} onClose={() => setOpen(false)} title={title} size={sheetSize}>
        {open ? children : null}
      </FormSheet>
    </>
  );
}
