"use client";

import { useState, type ReactNode } from "react";

import { Tabs } from "@/components/ui/Tabs";

// Marketing's two areas: the client-portal carousel and price discounts.
export function MarketingTabs({ carousel, discounts }: { carousel: ReactNode; discounts: ReactNode }) {
  const [tab, setTab] = useState<"carousel" | "discounts">("carousel");
  return (
    <div className="space-y-6">
      <Tabs
        label="Marketing"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "carousel", label: "Carousel" },
          { key: "discounts", label: "Discounts" },
        ]}
      />
      {tab === "carousel" ? carousel : discounts}
    </div>
  );
}
