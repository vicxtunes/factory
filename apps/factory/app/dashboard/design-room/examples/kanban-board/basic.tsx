"use client";

import { useState } from "react";

import { KanbanBoard, moveCard } from "@repo/ui/KanbanBoard";
import { TaskCard } from "@repo/ui/TaskCard";

import { BOARD, task, taskCardProps } from "../_data/projects";

// Drag cards between columns (or use each card's ⋯ menu). Review starts
// empty to show the empty-column state.
export default function KanbanBoardBasic() {
  const [columns, setColumns] = useState(BOARD);
  const [opened, setOpened] = useState<string>();
  const done = new Set(columns.find((c) => c.key === "done")?.cardKeys);

  return (
    <div className="space-y-3">
      <KanbanBoard
        columns={columns}
        cardLabel={(key) => task(key).title}
        onMove={(key, to, index) => setColumns((cols) => moveCard(cols, key, to, index))}
        renderCard={(key, menu) => (
          <TaskCard {...taskCardProps(key, { done: done.has(key) })} actions={menu} onClick={() => setOpened(task(key).title)} />
        )}
      />
      <p className="text-xs text-muted">{opened ? `Opened “${opened}”` : "Click a card to open it."}</p>
    </div>
  );
}
