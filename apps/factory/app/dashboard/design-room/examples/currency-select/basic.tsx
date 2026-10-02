"use client";

import { useState } from "react";

import { CurrencySelect } from "@repo/ui/CurrencySelect";
import type { Currency } from "@repo/lib/types";

const CURRENCIES: Currency[] = [
  { id: "1", code: "UGX", label: "Uganda shilling", symbol: "USh", rate: 1, is_base: true, active: true, sort_order: 0 },
  { id: "2", code: "USD", label: "US dollar", symbol: "$", rate: 0.00027, is_base: false, active: true, sort_order: 1 },
];

export default function CurrencySelectBasic() {
  const [code, setCode] = useState("UGX");
  const selected = CURRENCIES.find((c) => c.code === code) ?? null;
  return (
    <div className="flex items-center gap-3 text-sm">
      Price in <CurrencySelect currencies={CURRENCIES} selected={selected} onChange={setCode} />
    </div>
  );
}
