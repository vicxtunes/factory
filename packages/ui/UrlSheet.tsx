"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { FormSheet } from "./FormSheet";

/**
 * A page's create or edit form in the sheet, opened by its address (a list's
 * "?new", a record's "?edit"), so a link or the back button opens and closes
 * it. The page renders it only while the address asks for it; closing goes to
 * `closeHref` (the address without it). A form that saves and goes to the
 * record's page closes it on the way.
 */
export function UrlSheet({ title, closeHref, size, children }: { title: string; closeHref: string; size?: "md" | "lg"; children: ReactNode }) {
  const router = useRouter();
  return (
    <FormSheet open onClose={() => router.replace(closeHref, { scroll: false })} title={title} size={size}>
      {children}
    </FormSheet>
  );
}
