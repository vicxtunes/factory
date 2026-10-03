"use client";

import { useState } from "react";

import { KanbanBoard, moveCard } from "@repo/ui/KanbanBoard";
import { TaskCard } from "@repo/ui/TaskCard";

import { BOARD, task, taskCardProps } from "../_data/projects";

// In progress is over its limit of 2, so its header turns amber — move a
// card out and it goes back to normal.
export default function KanbanBoardWithLimits() {
  const [columns, setColumns] = useState(() =>
    BOARD.map((c) => (c.key === "doing" ? { ...c, limit: 2 } : c.key === "review" ? { ...c, limit: 2 } : c)),
  );
  const done = new Set(columns.find((c) => c.key === "done")?.cardKeys);

  return (
    <KanbanBoard
      columns={columns}
      cardLabel={(key) => task(key).title}
      onMove={(key, to, index) => setColumns((cols) => moveCard(cols, key, to, index))}
      renderCard={(key, menu) => <TaskCard {...taskCardProps(key, { done: done.has(key) })} actions={menu} />}
    />
  );
}
