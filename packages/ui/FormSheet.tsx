"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { BottomSheet } from "./BottomSheet";
import { Drawer } from "./Drawer";

const DESKTOP = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * A form that creates or updates something (add funds, a service, a hire),
 * over the page rather than on a page of its own: a panel from the right on a
 * desktop, a sheet from the bottom on a phone.
 */
export function FormSheet({
  open,
  onClose,
  title,
  size,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** The desktop panel's width: "lg" for a long form (a whole profile). */
  size?: "md" | "lg";
  children: ReactNode;
}) {
  // Phones first: the server renders the sheet, and a desktop swaps to the panel once it's running.
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => false);
  return desktop ? (
    <Drawer open={open} onClose={onClose} title={title} size={size}>
      {children}
    </Drawer>
  ) : (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {children}
    </BottomSheet>
  );
}
