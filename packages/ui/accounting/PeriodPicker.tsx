"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@repo/ui/Button";
import { TextInput } from "@repo/ui/Field";
import { Tabs } from "@repo/ui/Tabs";
import { PERIOD_PRESETS, type Period, type PeriodPreset } from "@repo/lib/accounting/core/period";

// The reporting period, kept in the URL (?period=…&from=…&to=…) so a view can
// be bookmarked or shared and the server renders it directly.
export function PeriodPicker({ period }: { period: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  const [custom, setCustom] = useState(period.preset === "custom");
  const [from, setFrom] = useState(period.fromDate ?? "");
  const [to, setTo] = useState(period.toDate ?? "");

  function go(params: Record<string, string>) {
    router.push(`${pathname}?${new URLSearchParams(params)}`);
  }

  function choose(key: PeriodPreset) {
    if (key === "custom") {
      setCustom(true);
      return;
    }
    setCustom(false);
    go({ period: key });
  }

  return (
    <div className="space-y-3">
      <Tabs
        label="Period"
        value={custom ? "custom" : period.preset}
        onChange={choose}
        tabs={[...PERIOD_PRESETS.map((p) => ({ key: p.value as PeriodPreset, label: p.label })), { key: "custom", label: "Custom" }]}
      />
      {custom ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) go({ period: "custom", from, to });
          }}
        >
          <label className="text-xs text-muted">
            From
            <TextInput type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label className="text-xs text-muted">
            To
            <TextInput type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} required />
          </label>
          <Button type="submit" variant="primary">
            Apply
          </Button>
        </form>
      ) : null}
    </div>
  );
}
