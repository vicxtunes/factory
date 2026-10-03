"use client";

import { useState } from "react";

import { KanbanBoard, moveCard, moveColumn } from "@repo/ui/KanbanBoard";
import { TaskCard } from "@repo/ui/TaskCard";

import { BOARD, task, taskCardProps } from "../_data/projects";

// Passing onColumnMove makes columns draggable by their header, and adds
// Move left / Move right to each header's ⋯ menu.
export default function KanbanBoardReorderColumns() {
  const [columns, setColumns] = useState(BOARD);
  const done = new Set(columns.find((c) => c.key === "done")?.cardKeys);

  return (
    <KanbanBoard
      columns={columns}
      cardLabel={(key) => task(key).title}
      onMove={(key, to, index) => setColumns((cols) => moveCard(cols, key, to, index))}
      onColumnMove={(key, index) => setColumns((cols) => moveColumn(cols, key, index))}
      renderCard={(key, menu) => <TaskCard {...taskCardProps(key, { done: done.has(key) })} actions={menu} />}
    />
  );
}
