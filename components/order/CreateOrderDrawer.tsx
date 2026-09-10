"use client";

import { useState, type ReactNode } from "react";

import { Drawer } from "@/components/ui/Drawer";

import { OrderForm, type OrderFormProps } from "./OrderForm";

// A "New order" trigger + right-sliding drawer holding the order wizard —
// used on the dashboard Orders board and the graphics board so order entry
// never leaves the page it started from.
export function CreateOrderDrawer({
  trigger,
  onCreated,
  ...formProps
}: Omit<OrderFormProps, "onCreated"> & {
  trigger: (open: () => void) => ReactNode;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {trigger(() => setOpen(true))}
      <Drawer open={open} onClose={() => setOpen(false)} title="New order" size="lg">
        {open ? <OrderForm {...formProps} onCreated={onCreated} /> : null}
      </Drawer>
    </>
  );
}
