"use client";

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { Drawer } from "@repo/ui/Drawer";

import { DemoTaskDetail } from "../_data/task-detail";

// TaskDetail in the large Drawer — how a board or list would open a task.
export default function TaskDetailDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open task</Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Task" size="lg">
        <DemoTaskDetail />
      </Drawer>
    </>
  );
}
