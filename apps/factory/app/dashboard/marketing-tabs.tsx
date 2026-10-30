"use client";

import { useState, type ReactNode } from "react";

import { Tabs } from "@repo/ui/Tabs";

// Marketing's areas: the client-portal carousel, price discounts and promo
// codes, and the top-up bonus.
export function MarketingTabs({ carousel, discounts, bonus }: { carousel: ReactNode; discounts: ReactNode; bonus: ReactNode }) {
  const [tab, setTab] = useState<"carousel" | "discounts" | "bonus">("carousel");
  return (
    <div className="space-y-6">
      <Tabs
        label="Marketing"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "carousel", label: "Carousel" },
          { key: "discounts", label: "Discounts & codes" },
          { key: "bonus", label: "Top-up bonus" },
        ]}
      />
      {tab === "carousel" ? carousel : tab === "discounts" ? discounts : bonus}
    </div>
  );
}
