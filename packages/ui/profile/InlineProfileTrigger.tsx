"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Avatar } from "./Avatar";
import { ManageProfileModal } from "./ManageProfileModal";

// /factory and /graphics have no dropdown user-menu (just a name + a plain
// Logout link — see LogoutButton in each) — clicking the name/avatar in the
// header opens "manage profile" directly instead of hiding it in a menu.
export function InlineProfileTrigger({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 text-white/80 hover:text-white sm:flex"
      >
        <Avatar url={avatarUrl} name={name} sizeClassName="h-7 w-7 text-xs" />
        <span className="max-w-32 truncate">{name}</span>
      </button>
      <ManageProfileModal
        open={open}
        onClose={() => setOpen(false)}
        name={name}
        avatarUrl={avatarUrl}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
