"use client";

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Drawer } from "@repo/ui/Drawer";

export default function DrawerBasic() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open drawer</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Order #0412"
        footer={
          <Button className="w-full" onClick={() => setOpen(false)}>
            Save
          </Button>
        }
      >
        <p className="text-sm text-muted">Detail content scrolls here; the footer stays pinned.</p>
      </Drawer>
    </>
  );
}
