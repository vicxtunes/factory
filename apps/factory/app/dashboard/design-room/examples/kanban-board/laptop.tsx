"use client";

import { useState } from "react";

import { DeviceFrame } from "@repo/ui/DeviceFrame";
import { KanbanBoard, moveCard, moveColumn } from "@repo/ui/KanbanBoard";
import { TaskCard } from "@repo/ui/TaskCard";

import { BOARD, task, taskCardProps } from "../_data/projects";

// The full board at a real 1440px laptop width — still interactive.
export default function KanbanBoardLaptop() {
  const [columns, setColumns] = useState(BOARD);
  const done = new Set(columns.find((c) => c.key === "done")?.cardKeys);

  return (
    <DeviceFrame device="laptop" className="mx-auto w-full max-w-[1100px]">
      <h1 className="mb-4 text-xl font-semibold">Showroom refresh</h1>
      <KanbanBoard
        columns={columns}
        cardLabel={(key) => task(key).title}
        onMove={(key, to, index) => setColumns((cols) => moveCard(cols, key, to, index))}
        onColumnMove={(key, index) => setColumns((cols) => moveColumn(cols, key, index))}
        renderCard={(key, menu) => <TaskCard {...taskCardProps(key, { done: done.has(key) })} actions={menu} />}
      />
    </DeviceFrame>
  );
}
