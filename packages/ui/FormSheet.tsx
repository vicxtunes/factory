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
 * A short form (add funds, transfer, withdraw) over the page, not further
 * down it: a sheet from the bottom on a phone, a panel from the side on a
 * desktop.
 */
export function FormSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  // Phones first: the server renders the sheet, and a desktop swaps to the panel once it's running.
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => false);
  return desktop ? (
    <Drawer open={open} onClose={onClose} title={title}>
      {children}
    </Drawer>
  ) : (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {children}
    </BottomSheet>
  );
}
