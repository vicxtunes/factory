"use client";

import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { DataTable } from "@repo/ui/DataTable";

interface Row {
  id: string;
  order: string;
  client: string;
}

const ROWS: Row[] = [
  { id: "1", order: "ORD-0412", client: "Nakato Sarah" },
  { id: "2", order: "ORD-0398", client: "Kampala Prints Ltd" },
  { id: "3", order: "ORD-0377", client: "Okello James" },
];

export default function DataTableSelectable() {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{selectedKeys.size} selected</p>
        <Button variant="secondary" disabled={selectedKeys.size === 0}>
          Export selected
        </Button>
      </div>
      <DataTable
        rows={ROWS}
        rowKey={(r) => r.id}
        selection={{
          selectedKeys,
          onToggle: toggle,
          onToggleAll: (checked) => setSelectedKeys(checked ? new Set(ROWS.map((r) => r.id)) : new Set()),
        }}
        columns={[
          { key: "order", header: "Order", render: (r) => <span className="tnum">{r.order}</span> },
          { key: "client", header: "Client", render: (r) => r.client },
        ]}
      />
    </div>
  );
}
