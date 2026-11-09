"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";

import { markStaffNotificationsRead } from "../../notification-actions";

export function MarkAllRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={busy}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await markStaffNotificationsRead();
        setBusy(false);
        router.refresh();
      }}
    >
      Mark all as read
    </Button>
  );
}
