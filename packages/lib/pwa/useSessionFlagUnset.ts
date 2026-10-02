"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

// Reads a sessionStorage flag safely across SSR/hydration: returns the
// server-safe default (false) for the initial server+first-client render,
// then React re-checks on the client and updates without a hydration
// mismatch warning — unlike a `useState(() => sessionStorage...)` lazy
// initializer, which returns different values on the server and the first
// client render and causes exactly that mismatch (a visible pop-in re-render).
export function useSessionFlagUnset(key: string): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => !sessionStorage.getItem(key),
    () => false,
  );
}
