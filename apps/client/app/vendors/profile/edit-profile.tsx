"use client";

import { useState, type ReactNode } from "react";

import { FormSheet } from "@repo/ui/FormSheet";
import type { Vendor } from "@repo/lib/vendors/core";

import { EditProfileForm } from "./edit-profile-form";

/** "Edit profile": the whole profile, pictures first, in the sheet (the panel from the right on a desktop). */
export function EditProfile({ vendor, pictures }: { vendor: Vendor; pictures: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-medium hover:bg-surface">
        Edit profile
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Edit profile" size="lg">
        {open ? <EditProfileForm vendor={vendor} pictures={pictures} onSaved={() => setOpen(false)} /> : null}
      </FormSheet>
    </>
  );
}
